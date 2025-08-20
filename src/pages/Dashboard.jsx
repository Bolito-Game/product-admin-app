import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { authService } from '../services/authService';
import Spinner from '../components/Spinner';
import LocalizationModal from '../components/LocalizationModal';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

const createDefaultLocalization = (category = '') => ({
  lang: 'en',
  country: 'us',
  categoryText: category,
  productName: '',
  description: '',
  price: 0.0,
  currency: 'USD',
});

const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'];

function Dashboard() {
  const [products, setProducts] = useState([]);
  const [originalProducts, setOriginalProducts] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [validationErrors, setValidationErrors] = useState({}); // To track invalid fields
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const hasChanges = useMemo(() => {
    return JSON.stringify(products) !== JSON.stringify(originalProducts);
  }, [products, originalProducts]);

  const fetchProducts = useCallback(async (token = null) => {
    setLoading(true);
    setError('');
    try {
      const responseData = await apiService.getAllProducts(50, token);

      if (!responseData || !responseData.getAllProducts) {
        throw new Error("Invalid data structure received from API.");
      }
      
      const { items, nextToken: newNextToken } = responseData.getAllProducts;

      const fetchedProducts = items.map(p => ({
        ...p,
        localizations: p.localizations?.length > 0 ? p.localizations : [createDefaultLocalization(p.category)],
        isNew: false,
        isDeleted: false,
      }));
      
      const newProducts = token ? [...products, ...fetchedProducts] : fetchedProducts;
      setProducts(newProducts);
      setOriginalProducts(deepCopy(newProducts));
      setNextToken(newNextToken);
    } catch (err) {
      setError(`Failed to fetch products: ${err.message}`); 
      if (err.message.includes('401') || err.message.includes('authenticated') || err.message.includes('Failed to fetch')) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleOpenLocalizationModal = (product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseLocalizationModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleLocalizationsUpdate = (updatedProduct) => {
    const updatedProducts = products.map(p => p.sku === updatedProduct.sku ? updatedProduct : p);
    setProducts(updatedProducts);
    setOriginalProducts(deepCopy(updatedProducts));
    handleCloseLocalizationModal();
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const handleSelectionChange = (sku) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(sku)) newSelection.delete(sku);
    else newSelection.add(sku);
    setSelectedRows(newSelection);
  };

  const handleAddRow = () => {
    const newProduct = {
      sku: `NEW_${Date.now()}`,
      category: '',
      imageUrl: '',
      productStatus: 'ACTIVE',
      quantityInStock: 0,
      localizations: [createDefaultLocalization()],
      isNew: true,
      isDeleted: false,
    };
    setProducts([newProduct, ...products]);
  };

  const handleDeleteRows = () => {
    if (selectedRows.size === 0) return;
    setProducts(products.map(p => selectedRows.has(p.sku) ? { ...p, isDeleted: true } : p));
    setSelectedRows(new Set());
  };
  
  const handleInputChange = (sku, field, value) => {
    setProducts(products.map(p => {
      if (p.sku !== sku) return p;
      return { ...p, [field]: value };
    }));
  };
  
  const handleSaveChanges = async () => {
    if (!window.confirm(`You have pending changes. Are you sure you want to save them?`)) {
      return;
    }
    setIsSaving(true);
    setError('');
    setValidationErrors({}); // Clear previous errors

    // --- Validation Step ---
    const newValidationErrors = {};
    let hasValidationError = false;
    products.forEach(p => {
      if (!p.isDeleted) {
        const productErrors = [];
        const isSkuMissing = (p.isNew && (!p.sku || p.sku.startsWith('NEW_')));
        const isCategoryMissing = (!p.category || p.category.trim() === '');
        
        if (isSkuMissing) {
          productErrors.push('sku');
        }
        if (isCategoryMissing) {
          productErrors.push('category');
        }

        if (productErrors.length > 0) {
          newValidationErrors[p.sku] = productErrors;
          hasValidationError = true;
        }
      }
    });

    if (hasValidationError) {
      setValidationErrors(newValidationErrors);
      setError('SKU and Category are required. Please fill in the highlighted fields.');
      setIsSaving(false);
      return;
    }
    // --- End Validation Step ---

    const mutations = [];
    products.forEach(p => {
      const original = originalProducts.find(op => op.sku === p.sku);

      if (original && p.isDeleted) {
        mutations.push(apiService.deleteProduct(p.sku));
      } else if (p.isNew && !p.isDeleted) {
        const { isNew, isDeleted, ...productData } = p;
        const createInput = {
            ...productData,
            quantityInStock: parseInt(productData.quantityInStock, 10),
            localizations: productData.localizations.map(loc => ({...loc, price: parseFloat(loc.price)}))
        };
        mutations.push(apiService.createProduct(createInput));
      } else if (original && !p.isNew && !p.isDeleted) {
        const updateInput = { sku: p.sku };
        if (p.category !== original.category) updateInput.category = p.category;
        if (p.imageUrl !== original.imageUrl) updateInput.imageUrl = p.imageUrl;
        if (p.productStatus !== original.productStatus) updateInput.productStatus = p.productStatus;
        if (parseInt(p.quantityInStock, 10) !== original.quantityInStock) updateInput.quantityInStock = parseInt(p.quantityInStock, 10);
        
        if (Object.keys(updateInput).length > 1) {
          mutations.push(apiService.updateProduct(updateInput));
        }
      }
    });

    if (mutations.length === 0) {
      setIsSaving(false);
      return;
    }

    try {
      const results = await Promise.allSettled(mutations);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.error("Failed operations:", failures);
        throw new Error(`${failures.length} operations failed.`);
      }

      alert('Top-level changes saved successfully!');
      fetchProducts();
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dashboard-container">
      <Spinner show={loading || isSaving} />
      <LocalizationModal 
        isOpen={isModalOpen}
        product={editingProduct}
        onClose={handleCloseLocalizationModal}
        onSave={handleLocalizationsUpdate}
      />
      <header className="dashboard-header">
        <h1>Product Dashboard</h1>
        <button onClick={handleLogout}>Logout</button>
      </header>
      
      <div className="dashboard-controls">
        <button onClick={handleAddRow}>Add Product</button>
        <button onClick={handleDeleteRows} disabled={selectedRows.size === 0}>Delete Selected</button>
        <button onClick={handleSaveChanges} disabled={!hasChanges || isSaving} style={{backgroundColor: hasChanges ? 'var(--color-accent)' : ''}}>
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
              <th>Default Name</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Image URL</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => {
              const original = originalProducts.find(op => op.sku === product.sku);
              const isDirty = original && JSON.stringify(product) !== JSON.stringify(original);
              const rowClass = product.isDeleted ? 'is-deleted' : product.isNew ? 'is-new' : isDirty ? 'is-dirty' : '';
              const previewLoc = product.localizations[0] || {};
              const errors = validationErrors[product.sku] || [];

              if (product.isDeleted) return (<tr key={product.sku} className={rowClass}><td colSpan="8">This product will be deleted upon saving.</td></tr>);
              
              return (
                <tr key={product.sku} className={rowClass}>
                  <td><input type="checkbox" checked={selectedRows.has(product.sku)} onChange={() => handleSelectionChange(product.sku)} /></td>
                  <td>
                    {product.isNew ? 
                      <input
                        type="text"
                        value={product.sku.startsWith('NEW_') ? '' : product.sku}
                        placeholder="Enter SKU"
                        onChange={(e) => handleInputChange(product.sku, 'sku', e.target.value)}
                        className={errors.includes('sku') ? 'input-error' : ''}
                      /> :
                      product.sku
                    }
                  </td>
                  <td>{previewLoc.productName || '(No Name)'}</td>
                  <td>
                    <input
                      type="text"
                      value={product.category}
                      onChange={(e) => handleInputChange(product.sku, 'category', e.target.value)}
                      className={errors.includes('category') ? 'input-error' : ''}
                    />
                  </td>
                  <td><input type="number" value={product.quantityInStock} onChange={(e) => handleInputChange(product.sku, 'quantityInStock', e.target.value)} /></td>
                  <td>
                    <select
                      value={product.productStatus}
                      onChange={(e) => handleInputChange(product.sku, 'productStatus', e.target.value)}
                    >
                      {PRODUCT_STATUSES.map(status => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td><input type="text" value={product.imageUrl} placeholder="http://..." onChange={(e) => handleInputChange(product.sku, 'imageUrl', e.target.value)} /></td>
                  <td>
                    <button 
                      onClick={() => handleOpenLocalizationModal(product)} 
                      disabled={product.isNew}
                      title={product.isNew ? "Save the new product before managing localizations" : "Manage localizations"}
                    >
                      Manage Localizations ({product.localizations.length})
                    </button>
                  </td>
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