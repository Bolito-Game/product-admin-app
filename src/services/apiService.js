import { authService } from "./authService";

const endpoint = import.meta.env.VITE_GRAPHQL_API_ENDPOINT;

/**
 * A generic function to make GraphQL requests with automatic token refresh.
 * @param {string} query - The GraphQL query string.
 * @param {object} variables - The variables for the query.
 * @param {boolean} isRetry - Internal flag to prevent infinite retry loops.
 * @returns {Promise<object>} A promise that resolves with the GraphQL data.
 */
async function graphqlRequest(query, variables = {}, isRetry = false) {
  // Use the new async method to ensure we have a valid token
  const token = await authService.getCurrentUserToken();

  if (!token) {
    // If we still don't have a token, the refresh failed or the user is logged out.
    // You might want to redirect to the login page here.
    window.location.href = '/login'; 
    throw new Error("User is not authenticated.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token, // API Gateway uses the ID token directly
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (response.status === 401 && !isRetry) {
    console.log("Token expired or invalid. Attempting to refresh and retry...");
    
    // By calling getCurrentUserToken again, we force the refresh logic.
    // The previous call might have used a cached token from localStorage that was expired.
    // This call will force a round-trip to Cognito via getValidSession().
    await authService.getCurrentUserToken(); 

    // Retry the request once.
    return graphqlRequest(query, variables, true);
  }


  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const result = await response.json();

  if (result.errors) {
    // Check for specific auth errors from AppSync/GraphQL if applicable
    const authError = result.errors.find(e => e.errorType === 'Unauthorized');
    if (authError && !isRetry) {
        console.log("GraphQL returned Unauthorized. Attempting to refresh and retry...");
        await authService.getCurrentUserToken();
        return graphqlRequest(query, variables, true);
    }
    throw new Error(result.errors[0].message || "GraphQL error occurred");
  }

  return result.data;
}

export const apiService = {
  
  getProductsBySku: (skus) => {
    const query = `
      query GetProductsBySku($skus: [ID!]!) {
        getProductsBySku(skus: $skus) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(query, { skus });
  },

  getProductsByCategory: (category, limit = 20, nextToken = null) => {
    const query = `
      query GetProductsByCategory($category: String!, $limit: Int, $nextToken: String) {
        getProductsByCategory(category: $category, limit: $limit, nextToken: $nextToken) {
          items {
            sku
            category
            imageUrl
            productStatus
            quantityInStock
            localizations {
              lang
              country
              productName
              description
              price
              currency
            }
          }
          nextToken 
        }
      }
    `;
    return graphqlRequest(query, { category, limit, nextToken });
  },

  getAllProductsByLocalization: (lang = "en", country = "us", limit = 20, nextToken = null) => {
    const query = `
      query GetAllProductsByLocalization($lang: String, $country: String, $limit: Int, $nextToken: String) {
        getAllProductsByLocalization(lang: $lang, country: $country, limit: $limit, nextToken: $nextToken) {
          items {
            sku
            category
            imageUrl
            productStatus
            quantityInStock
            localizations {
              lang
              country
              productName
              description
              price
              currency
            }
          }
          nextToken
        }
      }
    `;
    return graphqlRequest(query, { lang, country, limit, nextToken });
  },

  getAllProducts: (limit = 20, nextToken = null) => {
    const query = `
      query GetAllProducts($limit: Int, $nextToken: String) {
        getAllProducts(limit: $limit, nextToken: $nextToken) {
          items {
            sku
            category
            imageUrl
            productStatus
            quantityInStock
            localizations {
              lang
              country
              productName
              description
              price
              currency
            }
          }
          nextToken
        }
      }
    `;
    return graphqlRequest(query, { limit, nextToken });
  },

  searchProducts: (search, limit = 20, nextToken = null) => {
    const query = `
      query SearchProducts($search: String!, $limit: Int, $nextToken: String) {
        searchProducts(search: $search, limit: $limit, nextToken: $nextToken) {
          items {
            sku
            category
            imageUrl
            productStatus
            quantityInStock
            localizations {
              lang
              country
              productName
              description
              price
              currency
            }
          }
          nextToken
        }
      }
    `;
    return graphqlRequest(query, { search, limit, nextToken });
  },

  getCategory: (category) => {
    const query = `
      query GetCategory($category: ID!) {
        getCategory(category: $category) {
          category
          translations {
            lang
            text
          }
        }
      }
    `;
    return graphqlRequest(query, { category });
  },

  getAllCategories: (limit = 20, nextToken = null) => {
    const query = `
      query GetAllCategories($limit: Int, $nextToken: String) {
        getAllCategories(limit: $limit, nextToken: $nextToken) {
          items {
            category
            translations {
              lang
              text
            }
          }
          nextToken
        }
      }
    `;
    return graphqlRequest(query, { limit, nextToken }); 
  },

  searchCategories: (search, limit = 20, nextToken = null) => {
    const query = `
      query SearchCategories($search: String!, $limit: Int, $nextToken: String) {
        searchCategories(search: $search, limit: $limit, nextToken: $nextToken) {
          items {
            category
            translations {
              lang
              text
            }
          }
          nextToken
        }
      }
    `;
    return graphqlRequest(query, { search, limit, nextToken });
  },

  getAllCategoriesByLanguage: (lang = "en", limit = 20, nextToken = null) => {
    const query = `
      query GetAllCategoriesByLanguage($lang: String, $limit: Int, $nextToken: String) {
        getAllCategoriesByLanguage(lang: $lang, limit: $limit, nextToken: $nextToken) {
          items {
            category
            text
          }
          nextToken
        }
      }
    `;
    return graphqlRequest(query, { lang, limit, nextToken });
  },

  getOrderEvents: async (limit = 25, nextToken = null, orderId = null) => {
    const query = `
      query GetOrderEvents($limit: Int, $nextToken: String, $orderId: String) {
        getOrderEvents(limit: $limit, nextToken: $nextToken, orderId: $orderId) {
          items {
            eventId
            orderId
            logType
            timestamp
            message
            details
          }
          nextToken
        }
      }
    `;
    const result = await graphqlRequest(query, { limit, nextToken, orderId });
    return result.getOrderEvents;
  },

  createProduct: (input) => {
    const mutation = `
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { input });
  },

  updateProduct: (input) => {
    const mutation = `
      mutation UpdateProduct($input: UpdateProductInput!) {
        updateProduct(input: $input) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { input });
  },

  deleteProduct: (sku) => {
    const mutation = `
      mutation DeleteProduct($sku: ID!) {
        deleteProduct(sku: $sku) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { sku });
  },

  addLocalization: (sku, localizations) => {
    const mutation = `
      mutation AddLocalization($sku: ID!, $localizations: [LocalizationInput!]!) {
        addLocalization(sku: $sku, localizations: $localizations) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { sku, localizations });
  },

  updateLocalization: (sku, localizations) => {
    const mutation = `
      mutation UpdateLocalization($sku: ID!, $localizations: [LocalizationInput!]!) {
        updateLocalization(sku: $sku, localizations: $localizations) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { sku, localizations });
  },

  removeLocalization: (sku, lang, country) => {
    const mutation = `
      mutation RemoveLocalization($sku: ID!, $lang: String!, $country: String!) {
        removeLocalization(sku: $sku, lang: $lang, country: $country) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { sku, lang, country });
  },

  createCategory: (input) => {
    const mutation = `
      mutation CreateCategory($input: CreateCategoryInput!) {
        createCategory(input: $input) {
          category
          translations {
            lang
            text
          }
        }
      }
    `;
    return graphqlRequest(mutation, { input });
  },

  deleteCategory: (category) => {
    const mutation = `
      mutation DeleteCategory($category: ID!) {
        deleteCategory(category: $category) {
          category
        }
      }
    `;
    return graphqlRequest(mutation, { category });
  },

  upsertCategoryTranslation: (input) => {
    const mutation = `
      mutation UpsertCategoryTranslation($input: UpsertCategoryTranslationInput!) {
        upsertCategoryTranslation(input: $input) {
          category
          translations {
            lang
            text
          }
        }
      }
    `;
    return graphqlRequest(mutation, { input });
  },

  removeCategoryTranslation: (category, lang) => {
    const mutation = `
      mutation RemoveCategoryTranslation($category: ID!, $lang: String!) {
        removeCategoryTranslation(category: $category, lang: $lang) {
          category
          translations {
            lang
            text
          }
        }
      }
    `;
    return graphqlRequest(mutation, { category, lang });
  },
};