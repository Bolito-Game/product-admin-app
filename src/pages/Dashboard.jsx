// src/pages/Dashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { authService } from '../services/authService';
import Spinner from '../components/Spinner';

// Helper to create a deep copy for tracking changes
const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

function Dashboard() {
  const [products, setProducts] = useState([]);
  const [originalProducts, setOriginalProducts] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const navigate = useNavigate();

  const hasChanges = useMemo(() => {
    return JSON.stringify(products) !== JSON.stringify(originalProducts);
  }, [products, originalProducts]);

  const fetchProducts = useCallback(
    async (token = null) => {
      setLoading(true);
      setError('');
      try {
        const { data } = await apiService.getProducts(50, token);
        const fetchedProducts = data.getAllProducts.items.map(p => ({ ...p, isNew: false, isDeleted: false }));
        setProducts(fetchedProducts);
        setOriginalProducts(deepCopy(fetchedProducts)); // Set the baseline for changes
        setNextToken(data.getAllProducts.nextToken);
      } catch (err) {
        setError('Failed to fetch products. Your session may have expired.');
        if (err.message.includes('401') || err.message.includes('authenticated')) {
          handleLogout();
        }
      } finally {
        setLoading(false);
        setSelectedRows(new Set());
      }
    },
    [navigate]
  );

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };
  
  const handleSelectionChange = (sku) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(sku)) {
      newSelection.delete(sku);
    } else {
      newSelection.add(sku);
    }
    setSelectedRows(newSelection);
  };
  
  const handleAddRow = () => {
    const newProduct = {
      SKU: `NEW_${Date.now()}`, // Temporary SKU
      Product_Name: '',
      Category: '',
      Description: '',
      Price: 0,
      Quantity_In_Stock: 0,
      Product_Status: 'Active',
      isNew: true, // Flag for new row
      isDeleted: false,
    };
    setProducts([newProduct, ...products]);
  };

  const handleDeleteRows = () => {
    if (selectedRows.size === 0) return;
    setProducts(products.map(p => 
      selectedRows.has(p.SKU) ? { ...p, isDeleted: true } : p
    ));
    setSelectedRows(new Set());
  };

  const handleInputChange = (sku, field, value) => {
    setProducts(products.map(p => 
      p.SKU === sku ? { ...p, [field]: value } : p
    ));
  };
  
  const handleSaveChanges = async () => {
    if (!window.confirm(`You have pending changes. Are you sure you want to save them?`)) {
      return;
    }
    setIsSaving(true);
    setError('');

    const mutations = [];
    const newSkuMap = {}; // To map temp SKUs to real SKUs after creation

    // 1. Identify Deletions
    products.forEach(p => {
      const original = originalProducts.find(op => op.SKU === p.SKU);
      if (original && p.isDeleted) {
        mutations.push(apiService.deleteProduct(p.SKU));
      }
    });

    // 2. Identify Creations
    products.forEach(p => {
      if (p.isNew && !p.isDeleted) {
        const { isNew, isDeleted, ...productData } = p;
        // The API requires a real SKU, so we need to get it from the user input.
        // Assuming the user fills in the SKU for the new row.
        const createInput = {
            SKU: productData.SKU,
            Category: productData.Category,
            Product_Status: productData.Product_Status,
            Quantity_In_Stock: parseInt(productData.Quantity_In_Stock, 10),
            localizations: [{
                lang: 'en', country: 'us', Product_Name: productData.Product_Name, Description: productData.Description, 
                Price: parseFloat(productData.Price), Currency: 'USD', Category_Text: p.Category
            }]
        };
        mutations.push(apiService.createProduct(createInput));
      }
    });

    // 3. Identify Updates
    products.forEach(p => {
      if (!p.isNew && !p.isDeleted) {
        const original = originalProducts.find(op => op.SKU === p.SKU);
        if (original && JSON.stringify(p) !== JSON.stringify(original)) {
          const updateInput = {
            SKU: p.SKU,
            Category: p.Category,
            Product_Status: p.Product_Status,
            Quantity_In_Stock: parseInt(p.Quantity_In_Stock, 10),
            localizations: [{
                lang: 'en', country: 'us', Product_Name: p.Product_Name, Description: p.Description,
                Price: parseFloat(p.Price), Currency: 'USD', Category_Text: p.Category
            }]
          };
          mutations.push(apiService.updateProduct(updateInput));
        }
      }
    });
    
    try {
      const results = await Promise.allSettled(mutations);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        throw new Error(`${failures.length} operations failed. Please check data and try again.`);
      }
      alert('All changes saved successfully!');
      fetchProducts(); // Refresh data from server
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dashboard-container">
      <Spinner show={loading || isSaving} />
      <header className="dashboard-header">
        <h1>Product Dashboard</h1>
        <button onClick={handleLogout}>Logout</button>
      </header>
      
      <div className="dashboard-controls">
        <button onClick={handleAddRow}>Add Product</button>
        <button onClick={handleDeleteRows} disabled={selectedRows.size === 0}>Delete Selected</button>
        <button onClick={handleSaveChanges} disabled={!hasChanges} style={{backgroundColor: hasChanges ? 'var(--color-accent)' : ''}}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
      
      {error && <p className="error-message">{error}</p>}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => {
              const original = originalProducts.find(op => op.SKU === product.SKU);
              const isDirty = original && JSON.stringify(product) !== JSON.stringify(original);
              const rowClass = product.isDeleted ? 'is-deleted' : product.isNew ? 'is-new' : isDirty ? 'is-dirty' : '';

              return (
                <tr key={product.SKU} className={rowClass}>
                  <td>
                    <input type="checkbox" checked={selectedRows.has(product.SKU)} onChange={() => handleSelectionChange(product.SKU)} />
                  </td>
                  <td>
                    {product.isNew ? 
                      <input type="text" value={product.SKU.startsWith('NEW_') ? '' : product.SKU} placeholder="Enter SKU" onChange={(e) => handleInputChange(product.SKU, 'SKU', e.target.value)} /> :
                      product.SKU
                    }
                  </td>
                  <td><input type="text" value={product.Product_Name} onChange={(e) => handleInputChange(product.SKU, 'Product_Name', e.target.value)} /></td>
                  <td><input type="text" value={product.Category} onChange={(e) => handleInputChange(product.SKU, 'Category', e.target.value)} /></td>
                  <td><input type="number" value={product.Price} onChange={(e) => handleInputChange(product.SKU, 'Price', e.target.value)} /></td>
                  <td><input type="number" value={product.Quantity_In_Stock} onChange={(e) => handleInputChange(product.SKU, 'Quantity_In_Stock', e.target.value)} /></td>
                  <td><input type="text" value={product.Product_Status} onChange={(e) => handleInputChange(product.SKU, 'Product_Status', e.target.value)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      
      <footer className="dashboard-footer">
        <button onClick={() => fetchProducts(nextToken)} disabled={!nextToken || loading}>
          {loading ? 'Loading...' : 'Load More'}
        </button>
      </footer>
    </div>
  );
}

export default Dashboard;