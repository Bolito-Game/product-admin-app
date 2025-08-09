// src/services/authService.js
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
};

const userPool = new CognitoUserPool(poolData);

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
          // Get the ID token which is needed for API Gateway authorization
          const idToken = session.getIdToken().getJwtToken();
          localStorage.setItem("idToken", idToken);
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
    localStorage.removeItem("idToken");
  },

  getCurrentUserToken: () => {
    return localStorage.getItem("idToken");
  },

  isAuthenticated: () => {
    return !!localStorage.getItem("idToken");
  },
};
