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

  return response.json();
}

// Specific API functions based on your schema
export const apiService = {
  getProducts: (limit = 20, nextToken = null) => {
    const query = `
      query GetAllProducts($limit: Int, $nextToken: String) {
        getAllProducts(limit: $limit, nextToken: $nextToken) {
          items {
            SKU
            Product_Name
            Category
            Description
            Price
            Quantity_In_Stock
            Product_Status
          }
          nextToken
        }
      }
    `;
    return graphqlRequest(query, { limit, nextToken });
  },

  createProduct: (input) => {
    const mutation = `
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) {
          success
          product { SKU }
          errors { message }
        }
      }
    `;
    return graphqlRequest(mutation, { input });
  },

  updateProduct: (input) => {
    const mutation = `
      mutation UpdateProduct($input: UpdateProductInput!) {
        updateProduct(input: $input) {
          success
          product { SKU }
          errors { message }
        }
      }
    `;
    return graphqlRequest(mutation, { input });
  },

  deleteProduct: (sku) => {
    const mutation = `
      mutation DeleteProduct($SKU: ID!) {
        deleteProduct(SKU: $SKU) {
          success
          errors { message }
        }
      }
    `;
    return graphqlRequest(mutation, { SKU: sku });
  },
};
