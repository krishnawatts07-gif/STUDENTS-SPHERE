import { 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  enableIndexedDbPersistence 
} from "firebase/firestore";
import { db } from "./firebaseConfig.js";

// ==========================================
// 1. Persistent Offline Caching Setup
// ==========================================

/**
 * Enables persistent offline caching for Cloud Firestore.
 * Allows reading and writing data while offline, syncing automatically when reconnected.
 * 
 * @param {import("firebase/firestore").Firestore} firestoreDb - Firestore instance.
 */
export const enableOfflineCache = async (firestoreDb = db) => {
  try {
    await enableIndexedDbPersistence(firestoreDb);
    console.log("Firestore offline persistence enabled successfully.");
  } catch (err) {
    if (err.code === "failed-precondition") {
      // Multiple tabs open, persistence can only be enabled in one tab at a time.
      console.warn("Firestore offline persistence failed: Multiple tabs open.");
    } else if (err.code === "unimplemented") {
      // The current browser does not support all of the features required to enable persistence
      console.warn("Firestore offline persistence is not supported by this browser.");
    } else {
      console.error("Error enabling Firestore offline persistence:", err);
    }
  }
};

// Enable offline persistence by default
enableOfflineCache();


// ==========================================
// 2. Cloud Firestore CRUD Operations
// ==========================================

/**
 * Saves an achievement document to a user's category subcollection.
 * Firestore Path: users/{userId}/{category}
 * 
 * @param {string} userId - The unique ID of the user.
 * @param {string} category - The category subcollection name (e.g., 'academic', 'sports', 'certificates').
 * @param {Object} data - The achievement document payload.
 * @returns {Promise<import("firebase/firestore").DocumentReference>} Reference to the newly created document.
 */
export const addAchievement = async (userId, category, data) => {
  try {
    if (!userId || !category) {
      throw new Error("Both userId and category parameters are required.");
    }

    // Reference to path: users/{userId}/{category}
    const subcollectionRef = collection(db, "users", userId, category);

    // Save document with payload and server timestamp
    const docRef = await addDoc(subcollectionRef, {
      ...data,
      createdAt: serverTimestamp()
    });

    console.log(`Achievement added to users/${userId}/${category} with ID:`, docRef.id);
    return docRef;
  } catch (error) {
    console.error(`Error in addAchievement (users/${userId}/${category}):`, error.message);
    throw error;
  }
};

/**
 * Fetches all achievement documents from a user's subcollections.
 * 
 * @param {string} userId - The unique ID of the user.
 * @param {string[]} [categories] - List of categories to query (defaults to common categories).
 * @returns {Promise<Array<{ id: string, category: string, [key: string]: any }>>} Array of achievement objects with document IDs and category metadata.
 */
export const getUserAchievements = async (
  userId, 
  categories = ["general", "academic", "sports", "projects", "certifications"]
) => {
  try {
    if (!userId) {
      throw new Error("userId parameter is required.");
    }

    const allAchievements = [];

    // Iterate through user's subcollections and fetch documents
    for (const category of categories) {
      const subcollectionRef = collection(db, "users", userId, category);
      const querySnapshot = await getDocs(subcollectionRef);

      querySnapshot.forEach((docSnap) => {
        allAchievements.push({
          id: docSnap.id,
          category,
          ...docSnap.data()
        });
      });
    }

    console.log(`Fetched ${allAchievements.length} achievements for user: ${userId}`);
    return allAchievements;
  } catch (error) {
    console.error(`Error in getUserAchievements for user (${userId}):`, error.message);
    throw error;
  }
};

export const updateAchievement = async (userId, category, achievementId, data) => {
  await updateDoc(doc(db, "users", userId, category, achievementId), data);
};

export const deleteAchievement = async (userId, category, achievementId) => {
  await deleteDoc(doc(db, "users", userId, category, achievementId));
};

export const subscribeToUserAchievements = (userId, categories, onChange, onError) => {
  const records = new Map();
  const unsubscribers = categories.map((category) => onSnapshot(
    collection(db, "users", userId, category),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const key = `${category}/${change.doc.id}`;
        if (change.type === "removed") records.delete(key);
        else records.set(key, { id: change.doc.id, category, ...change.doc.data() });
      });
      onChange([...records.values()]);
    },
    onError
  ));
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
};

export const addSkill = async (userId, name) => {
  if (!userId || !name) throw new Error("userId and skill name are required.");
  const colRef = collection(db, "users", userId, "skills");
  return await addDoc(colRef, { name: name.trim(), createdAt: serverTimestamp() });
};

export const deleteSkill = async (userId, skillId) => {
  await deleteDoc(doc(db, "users", userId, "skills", skillId));
};

export const subscribeToUserSkills = (userId, onChange, onError) => {
  return onSnapshot(
    collection(db, "users", userId, "skills"),
    (snapshot) => {
      const skills = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      onChange(skills);
    },
    onError
  );
};
