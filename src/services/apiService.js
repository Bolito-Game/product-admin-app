// src/services/apiService.js
import { authService } from "./authService";

const endpoint = import.meta.env.VITE_GRAPHQL_API_ENDPOINT;

// A generic function to make GraphQL requests
async function graphqlRequest(query, variables = {}) {
  const token = authService.getCurrentUserToken();
  if (!token) {
    throw new Error("User is not authenticated.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token, // API Gateway uses the token directly
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(result.errors[0].message || "GraphQL error occurred");
  }
  
  return result.data;
}

// Specific API functions based on your schema
export const apiService = {
  // Query operations
  getProductBySku: (sku, lang = "en", country = "us") => {
    const query = `
      query GetProductBySku($sku: ID!, $lang: String, $country: String) {
        getProductBySku(sku: $sku, lang: $lang, country: $country) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            categoryText
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(query, { sku, lang, country });
  },

  getProductsByCategory: (category, lang = "en", country = "us") => {
    const query = `
      query GetProductsByCategory($category: String!, $lang: String, $country: String) {
        getProductsByCategory(category: $category, lang: $lang, country: $country) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            categoryText
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(query, { category, lang, country });
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
              categoryText
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
              categoryText
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

  // Mutation operations
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
            categoryText
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
            categoryText
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
            categoryText
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

  // Localization-specific mutations
  addLocalization: (sku, localization) => {
    const mutation = `
      mutation AddLocalization($sku: ID!, $localization: LocalizationInput!) {
        addLocalization(sku: $sku, localization: $localization) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            categoryText
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { sku, localization });
  },

  updateLocalization: (sku, localization) => {
    const mutation = `
      mutation UpdateLocalization($sku: ID!, $localization: LocalizationInput!) {
        updateLocalization(sku: $sku, localization: $localization) {
          sku
          category
          imageUrl
          productStatus
          quantityInStock
          localizations {
            lang
            country
            categoryText
            productName
            description
            price
            currency
          }
        }
      }
    `;
    return graphqlRequest(mutation, { sku, localization });
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
            categoryText
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
};