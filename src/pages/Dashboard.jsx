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
  const [validationErrors, setValidationErrors] = useState({});
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
  const handleAddRow = () => setProducts([{ sku: `NEW_${Date.now()}`, category: '', imageUrl: '', productStatus: 'ACTIVE', quantityInStock: 0, localizations: [createDefaultLocalization()], isNew: true, isDeleted: false }, ...products]);
  const handleDeleteRows = () => { setProducts(products.map(p => selectedRows.has(p.sku) ? { ...p, isDeleted: true } : p)); setSelectedRows(new Set()); };
  const handleInputChange = (sku, field, value) => setProducts(products.map(p => (p.sku !== sku ? p : { ...p, [field]: value })));
  const handleSelectionChange = (sku) => { const newSelection = new Set(selectedRows); if (newSelection.has(sku)) newSelection.delete(sku); else newSelection.add(sku); setSelectedRows(newSelection); };
  
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
  const handleLocalizationsUpdate = (updatedProduct) => { setProducts(products.map(p => p.sku === updatedProduct.sku ? updatedProduct : p)); handleCloseLocalizationModal(); };
  
  const handleOpenTranslationsModal = (category) => { setEditingCategory(category); setIsTranslationsModalOpen(true); };
  const handleCloseTranslationsModal = () => { setIsTranslationsModalOpen(false); setEditingCategory(null); };
  
  const handleSaveTranslations = (updatedCategory) => {
    const newCategories = categories.map(c => 
      c.category === updatedCategory.category ? updatedCategory : c
    );
    setCategories(newCategories);
    
    const newOriginalCategories = originalCategories.map(c => 
      c.category === updatedCategory.category ? updatedCategory : c
    );
    setOriginalCategories(newOriginalCategories);
    
    handleCloseTranslationsModal();
  };
  
  const handleSaveChanges = async () => {
    // This function's logic remains the same, but it will now only be enabled for
    // changes made directly on the dashboard, not from the translations modal.
    if (!window.confirm(`Save pending changes to products and categories?`)) return;
    setIsSaving(true);
    setError('');
    
    let hasInvalidCategoryError = products.some(p => !p.isDeleted && p.category && !validCategoryNames.has(p.category));
    if (hasInvalidCategoryError) {
      setError('A product is assigned to a deleted category. Please select a valid category.');
      setIsSaving(false);
      return;
    }

    const mutations = [];

    // Category Mutations
    categories.forEach(c => {
      const original = originalCategories.find(oc => oc.category === c.category);
      if (c.isNew && !c.isDeleted) {
        // NOTE: This assumes new categories start with no translations.
        // The modal handles translations for existing categories.
        mutations.push(apiService.createCategory({ category: c.category, translations: [] }));
      } else if (original && !original.isNew && c.isDeleted) {
        mutations.push(apiService.deleteCategory(c.category));
      } 
      // NOTE: Translation updates are now handled by the modal, so that logic is removed from here
      // to avoid duplication and conflicts.
    });

    // Product Mutations
    products.forEach(p => {
      const original = originalProducts.find(op => op.sku === p.sku);
      if (original && !original.isNew && p.isDeleted) mutations.push(apiService.deleteProduct(p.sku));
      else if (p.isNew && !p.isDeleted) {
        const { isNew, isDeleted, ...data } = p;
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
      await fetchData(); // Refetch all data to ensure consistency
    } catch (err) {
      setError(`Save failed: ${err.message}`);
      await fetchData(); // Refetch to revert to a known good state
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
        <button onClick={handleAddRow}>Add Product</button>
        <button onClick={handleDeleteRows} disabled={selectedRows.size === 0}>Delete Selected Products</button>
        <button onClick={handleSaveChanges} disabled={!hasChanges || isSaving} style={{backgroundColor: hasChanges ? 'var(--color-accent)' : ''}}>
          {isSaving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
      
      {error && <p className="error-message">{error}</p>}

      {/* Products Section */}
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
                const isDirty = originalProducts.find(op => op.sku === product.sku) && JSON.stringify(product) !== JSON.stringify(originalProducts.find(op => op.sku === product.sku));
                const rowClass = product.isDeleted ? 'is-deleted' : product.isNew ? 'is-new' : isDirty ? 'is-dirty' : '';
                const isCategoryInvalid = product.category && !validCategoryNames.has(product.category);

                if (product.isDeleted) return (<tr key={product.sku} className={rowClass}><td colSpan="8">Product will be deleted upon saving.</td></tr>);
                
                return (
                  <tr key={product.sku} className={rowClass}>
                    <td><input type="checkbox" checked={selectedRows.has(product.sku)} onChange={() => handleSelectionChange(product.sku)} /></td>
                    <td>{product.isNew ? <input type="text" value={product.sku.startsWith('NEW_') ? '' : product.sku} onChange={(e) => handleInputChange(product.sku, 'sku', e.target.value)} /> : product.sku}</td>
                    <td>{product.localizations[0]?.productName || '(No Name)'}</td>
                    <td style={isCategoryInvalid ? { outline: '2px solid red', outlineOffset: '-2px' } : {}}>
                      <select value={product.category} onChange={(e) => handleInputChange(product.sku, 'category', e.target.value)}>
                        <option value="">-- Select --</option>
                        {isCategoryInvalid && <option value={product.category} style={{ color: 'red' }}>{product.category} (Deleted)</option>}
                        {validCategories.map(cat => <option key={cat.category} value={cat.category}>{cat.category}</option>)}
                      </select>
                    </td>
                    <td><input type="number" value={product.quantityInStock} onChange={(e) => handleInputChange(product.sku, 'quantityInStock', e.target.value)} /></td>
                    <td>
                      <select value={product.productStatus} onChange={(e) => handleInputChange(product.sku, 'productStatus', e.target.value)}>
                        {PRODUCT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td><input type="text" value={product.imageUrl} onChange={(e) => handleInputChange(product.sku, 'imageUrl', e.target.value)} /></td>
                    <td><button onClick={() => handleOpenLocalizationModal(product)} disabled={product.isNew}>Localizations ({product.localizations.length})</button></td>
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
      
      {/* Categories Section */}
      <div className='section-buffer'>
        <h2>Product Categories</h2>
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