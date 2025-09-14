// src/services/authService.js
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoRefreshToken, // We don't need to import this directly, getSession handles it.
} from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
};

const userPool = new CognitoUserPool(poolData);

/**
 * A Promise-wrapped version of cognitoUser.getSession.
 * This will automatically use the stored refresh token to get a new session
 * if the current session is expired.
 * @returns {Promise<CognitoUserSession>} A promise that resolves with a valid user session.
 */
const getValidSession = () => {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      reject(new Error("No user found. Please log in."));
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        reject(err);
        return;
      }
      if (!session.isValid()) {
        reject(new Error("Session is not valid. Please log in again."));
        return;
      }
      // The session is valid, resolve the promise with it.
      // The SDK has already handled refreshing the tokens if necessary.
      resolve(session);
    });
  });
};


export const authService = {
  login: (username, password) => {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session) => {
          // Store both the ID token and the Refresh token
          const idToken = session.getIdToken().getJwtToken();
          const refreshToken = session.getRefreshToken().getToken();
          
          localStorage.setItem("idToken", idToken);
          localStorage.setItem("refreshToken", refreshToken); // <-- Store refresh token
          
          resolve(idToken);
        },
        onFailure: (err) => {
          console.error("Login failed:", err);
          reject(err);
        },
      });
    });
  },

  logout: () => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }
    
    // Clear both tokens from storage
    localStorage.removeItem("idToken");
    localStorage.removeItem("refreshToken"); // <-- Remove refresh token
  },

  /**
   * Gets a valid ID token, refreshing it if necessary.
   * @returns {Promise<string|null>} A promise that resolves with the JWT token.
   */
  getCurrentUserToken: async () => {
    try {
      const session = await getValidSession();
      const idToken = session.getIdToken().getJwtToken();

      // The SDK may have refreshed the token. Let's update localStorage.
      localStorage.setItem('idToken', idToken);
      
      return idToken;
    } catch (error) {
      console.error("Could not get user token, user may need to log in:", error);
      // If we can't get a session, the user is effectively logged out.
      authService.logout();
      return null;
    }
  },

  isAuthenticated: () => {
    // A more robust check is to see if a user object exists in the pool's storage.
    return !!userPool.getCurrentUser();
  },
};