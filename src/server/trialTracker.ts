import fs from 'fs';
import path from 'path';
import { UserTrialProfile, TrialStatus } from '../types/research';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'trial-users.json');
const TELEGRAM_STATE_FILE = path.join(DATA_DIR, 'telegram-state.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadTelegramOffset(): number {
  try {
    if (fs.existsSync(TELEGRAM_STATE_FILE)) {
      const raw = fs.readFileSync(TELEGRAM_STATE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return typeof data.lastUpdateOffset === 'number' ? data.lastUpdateOffset : 0;
    }
  } catch (e) {
    // Ignore error
  }
  return 0;
}

export function saveTelegramOffset(offset: number): void {
  try {
    fs.writeFileSync(TELEGRAM_STATE_FILE, JSON.stringify({ lastUpdateOffset: offset, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (e) {
    // Ignore error
  }
}

function createDefaultProfile(
  userId: string,
  metadata?: { username?: string; firstName?: string; languageCode?: string }
): UserTrialProfile {
  const preferredLang = metadata?.languageCode?.toLowerCase().startsWith('en') ? 'en' : 'bn';
  return {
    user_id: userId,
    username: metadata?.username || metadata?.firstName || `User_${userId.slice(-4)}`,
    firstName: metadata?.firstName,
    joined_date: new Date().toISOString(),
    trial_day_count: 1, // Day 1 of 7
    status: 'active_trial',
    preferred_language: preferredLang,
    read_history_vectors: [],
    total_digests_received: 0,
  };
}

/**
 * Loads all user profiles from persistent disk storage (Firestore equivalent)
 */
function loadUsers(): Record<string, UserTrialProfile> {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[TrialTracker] Error reading users file:', err);
  }
  return {};
}

/**
 * Saves all user profiles atomically
 */
function saveUsers(users: Record<string, UserTrialProfile>): void {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('[TrialTracker] Error saving users file:', err);
  }
}

/**
 * Registers a new Telegram user dynamically or retrieves the existing user.
 * Prevents duplicate user records when the same user presses /start again.
 * Logs exact requirements:
 *   New Telegram user registered: <chat_id>
 *   Existing Telegram user: <chat_id>
 */
export function registerOrGetUser(
  chatId: string,
  metadata?: { username?: string; firstName?: string; languageCode?: string }
): { user: UserTrialProfile; isNew: boolean } {
  if (!chatId) {
    throw new Error('chatId is required to register or get a Telegram user.');
  }

  const cleanChatId = String(chatId).trim();
  const users = loadUsers();

  if (users[cleanChatId]) {
    // Existing user - do NOT create a duplicate record
    console.log(`Existing Telegram user: ${cleanChatId}`);
    
    // Update metadata if username/firstName was populated
    let modified = false;
    if (metadata?.username && users[cleanChatId].username !== metadata.username) {
      users[cleanChatId].username = metadata.username;
      modified = true;
    }
    if (metadata?.firstName && users[cleanChatId].firstName !== metadata.firstName) {
      users[cleanChatId].firstName = metadata.firstName;
      modified = true;
    }
    if (modified) {
      saveUsers(users);
    }
    
    return { user: users[cleanChatId], isNew: false };
  }

  // New user registration
  const newProfile = createDefaultProfile(cleanChatId, metadata);
  users[cleanChatId] = newProfile;
  saveUsers(users);

  console.log(`New Telegram user registered: ${cleanChatId}`);
  return { user: newProfile, isNew: true };
}

/**
 * Retrieves all registered Telegram users from persistent storage.
 */
export function getAllRegisteredUsers(): UserTrialProfile[] {
  const users = loadUsers();
  return Object.values(users);
}

/**
 * Retrieves all active users eligible for newspaper dispatch.
 */
export function getAllActiveUsers(): UserTrialProfile[] {
  const all = getAllRegisteredUsers();
  return all.filter((u) => u.status !== 'trial_expired' || u.trial_day_count <= 7);
}

/**
 * Retrieves a single user profile by their unique chat_id.
 */
export function getUserProfile(userId?: string): UserTrialProfile {
  const users = loadUsers();
  const targetId = userId || Object.keys(users)[0] || 'anonymous';

  if (!users[targetId]) {
    users[targetId] = createDefaultProfile(targetId);
    saveUsers(users);
  }
  return users[targetId];
}

/**
 * Updates a specific user's independent profile without mixing with other users.
 */
export function updateUserProfile(
  userId: string,
  updates: Partial<UserTrialProfile>
): UserTrialProfile {
  const cleanId = String(userId).trim();
  const users = loadUsers();
  const current = users[cleanId] || createDefaultProfile(cleanId);

  const updated: UserTrialProfile = {
    ...current,
    ...updates,
  };

  // Automatically sync status based on trial_day_count if not explicitly overridden
  if (typeof updates.trial_day_count === 'number' && !updates.status) {
    if (updated.status !== 'paid_subscriber') {
      if (updated.trial_day_count >= 8) {
        updated.status = 'trial_expired';
      } else if (updated.trial_day_count === 7) {
        updated.status = 'trial_expired'; // Cut-off stage
      } else if (updated.trial_day_count === 6) {
        updated.status = 'trial_warning'; // 24-hour pre-loss warning
      } else {
        updated.status = 'active_trial';
      }
    }
  }

  users[cleanId] = updated;
  saveUsers(users);
  return updated;
}

/**
 * Records user delivery status (SUCCESS or FAILED) for a specific user.
 */
export function markUserDeliveryResult(
  userId: string,
  success: boolean,
  error?: string
): void {
  const cleanId = String(userId).trim();
  const users = loadUsers();
  if (!users[cleanId]) return;

  users[cleanId].last_delivery_status = success ? 'SUCCESS' : 'FAILED';
  if (success) {
    users[cleanId].last_digest_sent_at = new Date().toISOString();
    users[cleanId].total_digests_received = (users[cleanId].total_digests_received || 0) + 1;
    users[cleanId].last_delivery_error = undefined;
  } else {
    users[cleanId].last_delivery_error = error;
  }

  saveUsers(users);
}

/**
 * Records user feedback (🔥 দরকারী vs 💤 ভালো লাগেনি) to refine their individual 4D interest vector.
 */
export function recordUserFeedback(
  userId: string,
  paperId: string,
  paperTitle: string,
  rating: 'HELPFUL' | 'NOT_HELPFUL',
  topicTags: string[] = []
): UserTrialProfile {
  const cleanId = String(userId).trim();
  const users = loadUsers();
  const user = users[cleanId] || createDefaultProfile(cleanId);

  // Filter out duplicate vote for same paper
  user.read_history_vectors = (user.read_history_vectors || []).filter((item) => item.paperId !== paperId);

  user.read_history_vectors.unshift({
    paperId,
    paperTitle,
    rating,
    timestamp: new Date().toISOString(),
    topicTags,
  });

  // Keep last 30 feedback items
  user.read_history_vectors = user.read_history_vectors.slice(0, 30);

  users[cleanId] = user;
  saveUsers(users);
  console.log(`[TrialTracker] Recorded feedback "${rating}" for user ${cleanId} on paper "${paperTitle}"`);
  return user;
}

/**
 * Increments trial day count and computes psychological stage for a specific user.
 */
export function advanceUserTrialDay(userId: string): {
  profile: UserTrialProfile;
  stageLabel: string;
} {
  const cleanId = String(userId).trim();
  const current = getUserProfile(cleanId);
  const nextDay = Math.min(8, current.trial_day_count + 1);

  let status: TrialStatus = current.status;
  let stageLabel = `Day ${nextDay} Free Trial`;

  if (current.status !== 'paid_subscriber') {
    if (nextDay >= 8) {
      status = 'trial_expired';
      stageLabel = 'Trial Expired (Paywall Locked)';
    } else if (nextDay === 7) {
      status = 'trial_expired';
      stageLabel = 'Day 7: The Cut-Off (Final Free Digest)';
    } else if (nextDay === 6) {
      status = 'trial_warning';
      stageLabel = 'Day 6: Pre-Loss Warning (24h Remaining)';
    } else {
      status = 'active_trial';
      stageLabel = `Day ${nextDay} of 7: Active Research Digest`;
    }
  } else {
    stageLabel = 'Paid Subscriber (Unlimited Continuous Dispatches)';
  }

  const updated = updateUserProfile(cleanId, {
    trial_day_count: nextDay,
    status,
    last_digest_sent_at: new Date().toISOString(),
  });

  return { profile: updated, stageLabel };
}

/**
 * Resets a user's 7-day trial back to Day 1.
 */
export function resetUserTrial(userId: string): UserTrialProfile {
  const cleanId = String(userId).trim();
  return updateUserProfile(cleanId, {
    trial_day_count: 1,
    status: 'active_trial',
    joined_date: new Date().toISOString(),
  });
}
