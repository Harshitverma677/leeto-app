import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string | null;
  emailVerified: boolean;
  leetCodeHandle?: string;
  trackingList: string[];
  createdAt: any;
  updatedAt: any;
  lastLoginAt: any;
}

/**
 * Validates format of a username
 */
export function validateUsernameFormat(username: string): { valid: boolean; error?: string } {
  const clean = username.trim();
  if (clean.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters long.' };
  }
  if (clean.length > 20) {
    return { valid: false, error: 'Username cannot exceed 20 characters.' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores.' };
  }
  return { valid: true };
}

/**
 * Checks if a username is available in Firestore
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const clean = username.trim().toLowerCase();
  const usernameDoc = doc(db, 'usernames', clean);
  const snap = await getDoc(usernameDoc);
  return !snap.exists();
}

/**
 * Registers a new user with email, password, and unique username.
 * Uses an atomic Firestore transaction to guarantee username uniqueness.
 */
export async function registerWithUsername(
  email: string,
  pass: string,
  username: string,
  displayName?: string
): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim();
  const usernameKey = cleanUsername.toLowerCase();

  const validation = validateUsernameFormat(cleanUsername);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Pre-check availability before creating Auth account
  const isAvailable = await checkUsernameAvailable(cleanUsername);
  if (!isAvailable) {
    throw new Error(`The username "${cleanUsername}" is already taken. Please choose another.`);
  }

  // 1. Create Firebase Auth user
  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
  } catch (authError: any) {
    throw new Error(getReadableAuthError(authError.code || authError.message));
  }

  const authUser = userCredential.user;

  try {
    // 2. Set Firebase Auth display name
    await updateProfile(authUser, {
      displayName: displayName?.trim() || cleanUsername,
    });

    // 3. Atomic transaction to register username & user profile
    await runTransaction(db, async (transaction) => {
      const usernameDocRef = doc(db, 'usernames', usernameKey);
      const usernameSnap = await transaction.get(usernameDocRef);

      if (usernameSnap.exists()) {
        throw new Error(`The username "${cleanUsername}" was just taken by another user.`);
      }

      const userDocRef = doc(db, 'users', authUser.uid);

      const profileData: Record<string, any> = {
        uid: authUser.uid,
        email: cleanEmail,
        username: cleanUsername,
        displayName: displayName?.trim() || cleanUsername,
        photoURL: authUser.photoURL || null,
        emailVerified: true,
        leetCodeHandle: cleanUsername,
        trackingList: [cleanUsername],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };

      // Reserve the username
      transaction.set(usernameDocRef, {
        uid: authUser.uid,
        username: cleanUsername,
        createdAt: serverTimestamp(),
      });

      // Write the user profile document
      transaction.set(userDocRef, profileData);
    });

    return {
      uid: authUser.uid,
      email: cleanEmail,
      username: cleanUsername,
      displayName: displayName?.trim() || cleanUsername,
      photoURL: authUser.photoURL || null,
      emailVerified: true,
      leetCodeHandle: cleanUsername,
      trackingList: [cleanUsername],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    };
  } catch (err: any) {
    // If the transaction fails, clean up the auth user to keep state consistent
    try {
      await authUser.delete();
    } catch (_) {}
    throw err;
  }
}

/**
 * Authenticates user with email and password
 */
export async function loginWithEmail(email: string, pass: string): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
    const authUser = userCredential.user;

    // Load Firestore profile
    const userDocRef = doc(db, 'users', authUser.uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      throw new Error('User profile not found in database. Please contact support.');
    }

    // Update last login timestamp asynchronously
    updateDoc(userDocRef, {
      lastLoginAt: serverTimestamp(),
    }).catch(() => {});

    return userSnap.data() as UserProfile;
  } catch (authError: any) {
    throw new Error(getReadableAuthError(authError.code || authError.message));
  }
}

/**
 * Signs out current user
 */
export async function logoutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Sends a password reset email
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
  } catch (error: any) {
    throw new Error(getReadableAuthError(error.code || error.message));
  }
}

/**
 * Helper translating Firebase Auth error codes into human-friendly explanations
 */
export function getReadableAuthError(code: string): string {
  if (code.includes('email-already-in-use')) {
    return 'An account already exists with this email address. Please sign in instead.';
  }
  if (code.includes('invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code.includes('weak-password')) {
    return 'Password is too weak. Please use at least 6 characters with letters and numbers.';
  }
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
    return 'Incorrect email or password. Please check and try again.';
  }
  if (code.includes('user-disabled')) {
    return 'This account has been disabled. Please contact support.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many unsuccessful attempts. Access has been temporarily restricted. Please try again later.';
  }
  if (code.includes('network-request-failed')) {
    return 'Network connection issue. Please check your internet connection.';
  }
  return code || 'An unexpected authentication error occurred. Please try again.';
}

