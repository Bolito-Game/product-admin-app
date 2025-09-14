import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { authService } from '../services/authService';
import Spinner from '../components/Spinner';
import LocalizationModal from '../components/LocalizationModal';
import CategoryTranslationsModal from '../components/CategoryTranslationsModal';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

const createDefaultLocalization = () => ({
  lang: 'en',
  country: 'us',
  productName: '',
  description: '',
  price: 0.0,
  currency: 'USD',
});

const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'];

function Dashboard() {
  // Product State
  const [products, setProducts] = useState([]);
  const [originalProducts, setOriginalProducts] = useState([]);
  const [productNextToken, setProductNextToken] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Category State
  const [categories, setCategories] = useState([]);
  const [originalCategories, setOriginalCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  // General Component State
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Modal State
  const [isLocalizationModalOpen, setIsLocalizationModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isTranslationsModalOpen, setIsTranslationsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const hasChanges = useMemo(() => {
    const productsChanged = JSON.stringify(products) !== JSON.stringify(originalProducts);
    const categoriesChanged = JSON.stringify(categories) !== JSON.stringify(originalCategories);
    return productsChanged || categoriesChanged;
  }, [products, originalProducts, categories, originalCategories]);

  const validCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const validCategoryNames = useMemo(() => new Set(validCategories.map(c => c.category)), [validCategories]);

  const duplicateSkuSet = useMemo(() => {
    const skuCounts = products
      .filter(p => !p.isDeleted && p.sku)
      .reduce((acc, p) => {
        acc[p.sku] = (acc[p.sku] || 0) + 1;
        return acc;
      }, {});
    return new Set(Object.keys(skuCounts).filter(sku => skuCounts[sku] > 1));
  }, [products]);

  const handleLogout = useCallback(() => {
    authService.logout();
    navigate('/login');
  }, [navigate]);

  const fetchData = useCallback(async (productToken = null) => {
    setLoading(true);
    setError('');
    try {
      const [productsResponse, categoriesResponse] = await Promise.all([
        apiService.getAllProducts(50, productToken),
        !productToken ? apiService.getAllCategories(200) : Promise.resolve(null)
      ]);

      if (!productsResponse || !productsResponse.getAllProducts) throw new Error("Invalid product data structure.");
      const { items: productItems, nextToken: newProductNextToken } = productsResponse.getAllProducts;
      const fetchedProducts = productItems.map(p => ({ ...p, localizations: p.localizations?.length > 0 ? p.localizations : [createDefaultLocalization()], isNew: false, isDeleted: false }));
      const newProducts = productToken ? [...products, ...fetchedProducts] : fetchedProducts;
      setProducts(newProducts);
      setOriginalProducts(deepCopy(newProducts));
      setProductNextToken(newProductNextToken);

      if (categoriesResponse?.getAllCategories) {
        const fetchedCategories = categoriesResponse.getAllCategories.items.map(c => ({ ...c, isNew: false, isDeleted: false }));
        setCategories(fetchedCategories);
        setOriginalCategories(deepCopy(fetchedCategories));
      }
    } catch (err) {
      setError(`An error is preventing access to your Product information: ${err.message}`);
      if (err.message.includes('401') || err.message.includes('authenticated')) handleLogout();
    } finally {
      setLoading(false);
    }
  }, [handleLogout, products]);

  useEffect(() => { fetchData() }, []);

  // --- Handlers ---
  const handleAddRow = () => {
    const tempId = `NEW_${Date.now()}`;
    setProducts([{ id: tempId, sku: '', category: '', imageUrl: '', productStatus: 'ACTIVE', quantityInStock: 0, localizations: [createDefaultLocalization()], isNew: true, isDeleted: false }, ...products]);
  };
  
  const handleRemoveNewRow = (identifier) => {
    setProducts(currentProducts => currentProducts.filter(p => p.id !== identifier));
  };

  const handleDeleteRows = () => {
    setProducts(products.map(p => {
        const identifier = p.isNew ? p.id : p.sku;
        return selectedRows.has(identifier) ? { ...p, isDeleted: true } : p;
    }));
    setSelectedRows(new Set());
  };

  const handleInputChange = (identifier, field, value) => {
      setProducts(products.map(p => {
          const pIdentifier = p.isNew ? p.id : p.sku;
          return pIdentifier !== identifier ? p : { ...p, [field]: value };
      }));
  };

  const handleSelectionChange = (identifier) => {
      const newSelection = new Set(selectedRows);
      if (newSelection.has(identifier)) newSelection.delete(identifier);
      else newSelection.add(identifier);
      setSelectedRows(newSelection);
  };

  const handleAddCategory = () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) return alert('Category name cannot be empty.');
    if (categories.some(c => c.category.toLowerCase() === trimmedName.toLowerCase() && !c.isDeleted)) return alert('Category already exists.');
    setCategories([{ category: trimmedName, translations: [], isNew: true, isDeleted: false }, ...categories]);
    setNewCategoryName('');
  };
  const handleDeleteCategory = (name) => { if (window.confirm(`Delete category: "${name}"? Products using this category will need updates.`)) setCategories(categories.map(c => c.category === name ? { ...c, isDeleted: true } : c)); };

  const handleOpenLocalizationModal = (product) => { setEditingProduct(product); setIsLocalizationModalOpen(true); };
  const handleCloseLocalizationModal = () => setIsLocalizationModalOpen(false);

  const handleLocalizationsUpdate = (updatedProduct) => {
    setProducts(currentProducts =>
        currentProducts.map(p => {
            // For new products, match by the temporary ID
            if (p.isNew && p.id === updatedProduct.id) {
                return updatedProduct;
            }
            // For existing products, match by SKU
            if (!p.isNew && p.sku === updatedProduct.sku) {
                return updatedProduct;
            }
            return p;
        })
    );
    handleCloseLocalizationModal();
  };
  
  const handleOpenTranslationsModal = (category) => { setEditingCategory(category); setIsTranslationsModalOpen(true); };
  const handleCloseTranslationsModal = () => { setIsTranslationsModalOpen(false); setEditingCategory(null); };
  
  const handleSaveTranslations = (updatedCategory) => {
    const newCategories = categories.map(c => c.category === updatedCategory.category ? updatedCategory : c);
    setCategories(newCategories);
    const newOriginalCategories = originalCategories.map(c => c.category === updatedCategory.category ? updatedCategory : c);
    setOriginalCategories(newOriginalCategories);
    handleCloseTranslationsModal();
  };
  
  const handleSaveChanges = async () => {
    setError('');
    const validationErrors = [];

    if (products.some(p => !p.isDeleted && !p.category)) {
      validationErrors.push("Products with no category assigned.");
    }
    if (products.some(p => !p.isDeleted && p.category && !validCategoryNames.has(p.category))) {
      validationErrors.push("Products assigned to a deleted category.");
    }
    if (duplicateSkuSet.size > 0) {
      validationErrors.push(`Duplicate SKUs found: ${[...duplicateSkuSet].join(', ')}.`);
    }
    
    if (validationErrors.length > 0) {
      setError(`Cannot save. Please correct the highlighted errors: ${validationErrors.join(' ')}`);
      return;
    }

    if (!window.confirm(`Save pending changes to products and categories?`)) return;
    setIsSaving(true);
    
    const mutations = [];

    categories.forEach(c => {
      const original = originalCategories.find(oc => oc.category === c.category);
      if (c.isNew && !c.isDeleted) {
        mutations.push(apiService.createCategory({ category: c.category, translations: [] }));
      } else if (original && !original.isNew && c.isDeleted) {
        mutations.push(apiService.deleteCategory(c.category));
      } 
    });

    products.forEach(p => {
      const original = originalProducts.find(op => op.sku === p.sku);
      if (original && !original.isNew && p.isDeleted) mutations.push(apiService.deleteProduct(p.sku));
      else if (p.isNew && !p.isDeleted) {
        const { isNew, isDeleted, id, ...data } = p;
        mutations.push(apiService.createProduct({ ...data, quantityInStock: parseInt(data.quantityInStock, 10) }));
      } else if (original && !p.isNew && !p.isDeleted && JSON.stringify(p) !== JSON.stringify(original)) {
        const { sku, category, imageUrl, productStatus, quantityInStock } = p;
        mutations.push(apiService.updateProduct({ sku, category, imageUrl, productStatus, quantityInStock: parseInt(quantityInStock, 10) }));
      }
    });

    if (mutations.length === 0) { setIsSaving(false); return; }

    try {
      await Promise.all(mutations);
      alert('All changes saved successfully!');
      await fetchData();
    } catch (err) {
      setError(`Save failed: ${err.message}`);
      await fetchData();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dashboard-container">
      <Spinner show={loading || isSaving} />
      <LocalizationModal isOpen={isLocalizationModalOpen} product={editingProduct} onClose={handleCloseLocalizationModal} onSave={handleLocalizationsUpdate} />
      <CategoryTranslationsModal isOpen={isTranslationsModalOpen} category={editingCategory} onClose={handleCloseTranslationsModal} onSave={handleSaveTranslations} />
      
      <header className="dashboard-header">
        <h1>Product Dashboard</h1>
        <button onClick={handleLogout}>Logout</button>
      </header>
      
      <div className="dashboard-controls">
        <button 
            onClick={handleAddRow} 
            disabled={validCategories.length === 0} 
            title={validCategories.length === 0 ? "You must create a category first." : "Add a new product row"}
        >
            Add Product
        </button>
        <button onClick={handleDeleteRows} disabled={selectedRows.size === 0}>Delete Selected Products</button>
        <button onClick={handleSaveChanges} disabled={!hasChanges || isSaving} style={{backgroundColor: hasChanges ? 'var(--color-accent)' : ''}}>
          {isSaving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
      
      {error && <p className="error-message">{error}</p>}

      <div>
        <h2>Products</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th></th><th>SKU</th><th>Default Name</th><th>Category</th><th>Stock</th><th>Status</th><th>Image URL</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => {
                const identifier = product.isNew ? product.id : product.sku;
                const isDirty = !product.isNew && originalProducts.find(op => op.sku === product.sku) && JSON.stringify(product) !== JSON.stringify(originalProducts.find(op => op.sku === product.sku));
                const rowClass = product.isDeleted ? 'is-deleted' : product.isNew ? 'is-new' : isDirty ? 'is-dirty' : '';

                const isCategoryDeleted = !product.isDeleted && product.category && !validCategoryNames.has(product.category);
                const isCategoryMissing = !product.isDeleted && !product.category;
                const isSkuDuplicate = !product.isDeleted && product.sku && duplicateSkuSet.has(product.sku);

                if (product.isDeleted) return (<tr key={identifier} className={rowClass}><td colSpan="8">Product will be deleted upon saving.</td></tr>);
                
                return (
                  <tr key={identifier} className={rowClass}>
                    <td><input type="checkbox" checked={selectedRows.has(identifier)} onChange={() => handleSelectionChange(identifier)} /></td>
                    <td className={isSkuDuplicate ? 'cell-error' : ''}>
                        {product.isNew ? 
                            <input 
                                type="text" 
                                value={product.sku} 
                                onChange={(e) => handleInputChange(identifier, 'sku', e.target.value)}
                                placeholder="Enter unique SKU"
                            /> : product.sku}
                    </td>
                    <td>{product.localizations[0]?.productName || '(No Name)'}</td>
                    <td className={isCategoryDeleted || isCategoryMissing ? 'cell-error' : ''}>
                      <select value={product.category} onChange={(e) => handleInputChange(identifier, 'category', e.target.value)}>
                        <option value="">-- Select --</option>
                        {isCategoryDeleted && <option value={product.category} style={{ color: 'red' }}>{product.category} (Deleted)</option>}
                        {validCategories.map(cat => <option key={cat.category} value={cat.category}>{cat.category}</option>)}
                      </select>
                    </td>
                    <td><input type="number" value={product.quantityInStock} onChange={(e) => handleInputChange(identifier, 'quantityInStock', e.target.value)} /></td>
                    <td>
                      <select value={product.productStatus} onChange={(e) => handleInputChange(identifier, 'productStatus', e.target.value)}>
                        {PRODUCT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td><input type="text" value={product.imageUrl} onChange={(e) => handleInputChange(identifier, 'imageUrl', e.target.value)} /></td>
                    <td className="actions-cell">
                        <button onClick={() => handleOpenLocalizationModal(product)}>Localizations ({product.localizations.length})</button>
                        {product.isNew && (
                            <button onClick={() => handleRemoveNewRow(identifier)} className="delete-button">Delete</button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="dashboard-footer">
            <button onClick={() => fetchData(productNextToken)} disabled={!productNextToken || loading}>{loading ? 'Loading...' : 'Load More Products'}</button>
          </div>
        </div>
      </div>
      
      <div className='section-buffer'>
        <div className="category-header">
            <h2>Product Categories</h2>
            {validCategories.length === 0 && (
                <span className="category-warning">
                    A category is required to create a product.
                </span>
            )}
        </div>
        <div className="category-manager">
          <div className="category-controls">
            <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="New category name" onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()} />
            <button onClick={handleAddCategory}>Add Category</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Category</th><th>Actions</th></tr></thead>
              <tbody>
                {categories.filter(c => !c.isDeleted).map(cat => {
                    const originalCat = originalCategories.find(oc => oc.category === cat.category);
                    const isDirty = JSON.stringify(cat) !== JSON.stringify(originalCat);
                    const rowClass = cat.isNew ? 'is-new' : isDirty ? 'is-dirty' : '';

                    return (
                      <tr key={cat.category} className={rowClass}>
                        <td>{cat.category}</td>
                        <td className="actions-cell">
                          <button onClick={() => handleOpenTranslationsModal(cat)}>Translations ({cat.translations?.length || 0})</button>
                          <button 
                            onClick={() => handleDeleteCategory(cat.category)} 
                            className="delete-button"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                })}
                {validCategories.length === 0 && (<tr><td colSpan="2">No categories found.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;