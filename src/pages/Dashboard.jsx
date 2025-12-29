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
  // Navigation
  const [activeTab, setActiveTab] = useState('inventory');

  // Product State
  const [products, setProducts] = useState([]);
  const [originalProducts, setOriginalProducts] = useState([]);
  const [productNextToken, setProductNextToken] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [productSearch, setProductSearch] = useState('');
  const [isProductSearchActive, setIsProductSearchActive] = useState(false);

  // Category State
  const [categories, setCategories] = useState([]);
  const [originalCategories, setOriginalCategories] = useState([]);
  const [displayedCategories, setDisplayedCategories] = useState([]); 
    
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySearch, setCategorySearch] = useState('');

  // Webhook Logs State
  const [eventLogs, setEventLogs] = useState([]);
  const [eventNextToken, setEventNextToken] = useState(null);
  const [logSearchOrderId, setLogSearchOrderId] = useState('');

  // General Component State
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Modal & Sort State
  const [isLocalizationModalOpen, setIsLocalizationModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isTranslationsModalOpen, setIsTranslationsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [productSortConfig, setProductSortConfig] = useState({ key: 'sku', direction: 'ascending' });
  const [categorySortConfig, setCategorySortConfig] = useState({ key: 'category', direction: 'ascending' });

  // Mobile Responsiveness Hook
  useEffect(() => {
    const applyTableLabels = () => {
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim().replace(/▲|▼/g, ''));
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          cells.forEach((cell, index) => {
            if (headers[index] && headers[index] !== '' && !cell.classList.contains('actions-cell')) {
              cell.setAttribute('data-label', headers[index]);
            }
          });
        });
      });
    };
    applyTableLabels();
  }, [products, displayedCategories, eventLogs, activeTab]);

  const hasChanges = useMemo(() => {
    const productsChanged = JSON.stringify(products) !== JSON.stringify(originalProducts);
    const categoriesChanged = JSON.stringify(categories) !== JSON.stringify(originalCategories);
    return productsChanged || categoriesChanged;
  }, [products, originalProducts, categories, originalCategories]);
  
  const hasCategoryChanges = useMemo(() => {
    return JSON.stringify(categories) !== JSON.stringify(originalCategories);
  }, [categories, originalCategories]);

  const validCategories = useMemo(() =>
    categories
      .filter(c => !c.isDeleted)
      .sort((a, b) => a.category.localeCompare(b.category)),
    [categories]
  );
  
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

  const sortedProducts = useMemo(() => {
    let sortableItems = [...products];
    if (productSortConfig.key !== null) {
        sortableItems.sort((a, b) => {
            const valA = a[productSortConfig.key] || '';
            const valB = b[productSortConfig.key] || '';
            const comparison = valA.toString().localeCompare(valB.toString(), undefined, { numeric: true });
            return productSortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }
    return sortableItems;
  }, [products, productSortConfig]);

  const sortedCategories = useMemo(() => {
    let sortableItems = [...displayedCategories.filter(c => !c.isDeleted)];
    if (categorySortConfig.key !== null) {
        sortableItems.sort((a, b) => {
            const valA = a[categorySortConfig.key] || '';
            const valB = b[categorySortConfig.key] || '';
            const comparison = valA.toString().localeCompare(valB.toString(), undefined, { numeric: true });
            return categorySortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }
    return sortableItems;
  }, [displayedCategories, categorySortConfig]);

  const handleLogout = useCallback(() => {
    authService.logout();
    navigate('/login');
  }, [navigate]);

  // Data Fetchers
  const fetchInventory = useCallback(async (productToken = null, productResults = null, isClearingSearch = false) => {
    setLoading(true);
    setError('');

    try {
      const [productsResponse, categoriesResponse] = await Promise.all([
        (!productResults && (!isProductSearchActive || isClearingSearch))
          ? apiService.getAllProducts(25, isClearingSearch ? null : productToken) 
          : Promise.resolve({ getAllProducts: { items: [], nextToken: null } }),
        (categories.length === 0) ? apiService.getAllCategories(200) : Promise.resolve(null)
      ]);

      let productItems;
      let newProductNextToken = null;
      
      if (productResults) {
        productItems = productResults.items || productResults;
        newProductNextToken = productResults.nextToken || null;
        setIsProductSearchActive(true); 
      } else if (productsResponse?.getAllProducts) {
        productItems = productsResponse.getAllProducts.items;
        newProductNextToken = productsResponse.getAllProducts.nextToken;
        setIsProductSearchActive(false); 
      } else {
        productItems = [];
      }

      const fetchedProducts = productItems.map(p => ({ 
        ...p, 
        localizations: p.localizations?.length > 0 ? p.localizations : [createDefaultLocalization()], 
        isNew: false, 
        isDeleted: false 
      }));

      const newProducts = (productToken && !isClearingSearch)
        ? [...products, ...fetchedProducts] 
        : fetchedProducts;
      
      setProducts(newProducts);
      setOriginalProducts(deepCopy(newProducts));
      setProductNextToken(newProductNextToken);
      setSelectedRows(new Set()); 

      if (categoriesResponse?.getAllCategories) {
        const fetchedCategories = categoriesResponse.getAllCategories.items.map(c => ({ ...c, isNew: false, isDeleted: false }));
        setCategories(fetchedCategories);
        setOriginalCategories(deepCopy(fetchedCategories));
        setDisplayedCategories(fetchedCategories);
      }

    } catch (err) {
      setError(`An error is preventing access to your Product information: ${err.message}`);
      if (err.message.includes('401') || err.message.includes('authenticated')) handleLogout();
    } finally {
      setLoading(false);
    }
  }, [handleLogout, products, isProductSearchActive, categories.length]);

  // --- REPAIRED LOGS FETCH LOGIC ---
  const fetchLogs = useCallback(async (token = null, isNewSearch = false) => {
      setLoading(true);
      setError('');
      try {
          // Pass logSearchOrderId to enable server-side filtering
          const response = await apiService.getOrderEvents(25, token, logSearchOrderId); 
          const newLogs = isNewSearch ? response.items : [...eventLogs, ...response.items];
          setEventLogs(newLogs);
          setEventNextToken(response.nextToken);
      } catch (err) {
          setError(`Error fetching logs: ${err.message}`);
      } finally {
          setLoading(false);
      }
  }, [eventLogs, logSearchOrderId]);

  // Initial Load & Tab Switching
  useEffect(() => { 
      if (activeTab === 'inventory' && products.length === 0) fetchInventory();
      if (activeTab === 'logs') fetchLogs(null, true);
  }, [activeTab]);


  // Handlers (Inventory)
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
    
    const newCat = { category: trimmedName, translations: [], isNew: true, isDeleted: false };
    setCategories([newCat, ...categories]);
    setDisplayedCategories(currentDisplayed => [newCat, ...currentDisplayed].filter(c => c.category.toLowerCase().includes(categorySearch.toLowerCase())));
    setNewCategoryName('');
  };
  
  const handleDeleteCategory = (name) => { 
    if (window.confirm(`Delete category: "${name}"? Products using this category will need updates.`)) {
        setCategories(categories.map(c => c.category === name ? { ...c, isDeleted: true } : c)); 
        setDisplayedCategories(currentDisplayed => currentDisplayed.filter(c => c.category !== name));
    }
  };

  // Handlers (Modals)
  const handleOpenLocalizationModal = (product) => { setEditingProduct(product); setIsLocalizationModalOpen(true); };
  const handleCloseLocalizationModal = () => setIsLocalizationModalOpen(false);

  const handleLocalizationsUpdate = (updatedProduct) => {
    setProducts(currentProducts =>
        currentProducts.map(p => {
            if (p.isNew && p.id === updatedProduct.id) return updatedProduct;
            if (!p.isNew && p.sku === updatedProduct.sku) return updatedProduct;
            return p;
        })
    );
    handleCloseLocalizationModal();
  };
  
  const handleOpenTranslationsModal = (category) => { setEditingCategory(category); setIsTranslationsModalOpen(true); };
  const handleCloseTranslationsModal = () => { setIsTranslationsModalOpen(false); setEditingCategory(null); };
  
  const handleSaveTranslations = (updatedCategory) => {
    setCategories(currentCategories =>
        currentCategories.map(c => c.category === updatedCategory.category ? updatedCategory : c)
    );
    setDisplayedCategories(currentDisplayed =>
        currentDisplayed.map(c => c.category === updatedCategory.category ? updatedCategory : c)
    );

    if (!updatedCategory.isNew) {
        setOriginalCategories(currentOriginals =>
            currentOriginals.map(c => c.category === updatedCategory.category ? deepCopy(updatedCategory) : c)
        );
    }
    handleCloseTranslationsModal();
  };
  
  const handleSaveChanges = async () => {
    setError('');
    const validationErrors = [];
    if (products.some(p => !p.isDeleted && !p.category)) validationErrors.push("Products with no category assigned.");
    if (products.some(p => !p.isDeleted && p.category && !validCategoryNames.has(p.category))) validationErrors.push("Products assigned to a deleted category.");
    if (duplicateSkuSet.size > 0) validationErrors.push(`Duplicate SKUs found: ${[...duplicateSkuSet].join(', ')}.`);
    
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
        mutations.push(apiService.createCategory({ category: c.category, translations: c.translations }));
      } else if (original && !original.isNew && c.isDeleted) {
        mutations.push(apiService.deleteCategory(c.category));
      } else if (original && !original.isNew && !c.isDeleted && JSON.stringify(c.translations) !== JSON.stringify(original.translations)) {
        mutations.push(apiService.updateCategory({ category: c.category, translations: c.translations }));
      } 
    });
    products.forEach(p => {
      const original = originalProducts.find(op => op.sku === p.sku);
      if (original && !original.isNew && p.isDeleted) mutations.push(apiService.deleteProduct(p.sku));
      else if (p.isNew && !p.isDeleted) {
        const { isNew, isDeleted, id, ...data } = p;
        mutations.push(apiService.createProduct({ ...data, quantityInStock: parseInt(data.quantityInStock, 10) }));
      } else if (original && !p.isNew && !p.isDeleted && JSON.stringify(p) !== JSON.stringify(original)) {
        const { sku, category, imageUrl, productStatus, quantityInStock, localizations } = p;
        mutations.push(apiService.updateProduct({ sku, category, imageUrl, productStatus, quantityInStock: parseInt(quantityInStock, 10), localizations }));
      }
    });

    try {
      await Promise.all(mutations);
      alert('All changes saved successfully!');
      await fetchInventory(); 
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getSortIndicator = (key, config) => {
    if (config.key === key) return config.direction === 'ascending' ? ' ▲' : ' ▼';
    return '';
  };
  
  const requestProductSort = (key) => {
    let direction = 'ascending';
    if (productSortConfig.key === key && productSortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setProductSortConfig({ key, direction });
  };

  const requestCategorySort = (key) => {
    let direction = 'ascending';
    if (categorySortConfig.key === key && categorySortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setCategorySortConfig({ key, direction });
  };

  const handleProductSearch = useCallback(async (e, nextToken = null) => {
    if (e && e.key && e.key !== 'Enter') return;
    const searchString = productSearch.trim();
    if (!searchString && !nextToken) return fetchInventory(null, null, true); 
    
    setLoading(true);
    try {
      const skuMatch = searchString.match(/^SKU:(.*)/i);
      const categoryMatch = searchString.match(/^(Category|Cat):(.*)/i);
      let productResults;

      if (skuMatch) {
        const skus = skuMatch[1].split(',').map(s => s.trim()).filter(s => s);
        const response = await apiService.getProductsBySku(skus);
        productResults = { items: response.getProductsBySku, nextToken: null };
      } else if (categoryMatch) {
        const category = categoryMatch[2].trim();
        const response = await apiService.getProductsByCategory(category, 25, nextToken); 
        productResults = response.getProductsByCategory; 
      } else {
        const response = await apiService.searchProducts(searchString, 25, nextToken);
        productResults = response.searchProducts;
      }
      await fetchInventory(nextToken, productResults); 
      setIsProductSearchActive(true); 

    } catch (err) {
      setError(`Product search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [productSearch, fetchInventory]);
  
  const handleCategorySearch = useCallback(async (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    const searchString = categorySearch.trim();
    if (!searchString) {
      setDisplayedCategories(categories);
      return;
    }
    setLoading(true);
    try {
      const response = await apiService.searchCategories(searchString);
      const searchResults = response.searchCategories.items;
      const categoryMap = new Map(categories.map(c => [c.category, c]));
      const newDisplayedCategories = searchResults
        .map(result => categoryMap.get(result.category) || result)
        .filter(c => !c.isDeleted || c.category.toLowerCase().includes(searchString.toLowerCase()));
      setDisplayedCategories(newDisplayedCategories);
    } catch (err) {
      setError(`Category search failed: ${err.message}`);
      setDisplayedCategories([]); 
    } finally {
      setLoading(false);
    }
  }, [categorySearch, categories]);

  // Handler (Logs Search)
  const handleLogSearch = () => {
    fetchLogs(null, true);
  };

  return (
    <div className="dashboard-container">
      <Spinner show={loading || isSaving} />
      <LocalizationModal isOpen={isLocalizationModalOpen} product={editingProduct} onClose={handleCloseLocalizationModal} onSave={handleLocalizationsUpdate} />
      <CategoryTranslationsModal isOpen={isTranslationsModalOpen} category={editingCategory} onClose={handleCloseTranslationsModal} onSave={handleSaveTranslations} />
      
      <header className="dashboard-header">
        <h1>Management Console</h1>
        <button onClick={handleLogout}>Logout</button>
      </header>

      {/* TABS */}
      <div className="tabs-container">
        <button className={`tab-button ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
            Inventory Management
        </button>
        <button className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
            PayPal Event Logs
        </button>
      </div>
      
      {error && <p className="error-message">{error}</p>}

      {/* --- INVENTORY TAB CONTENT --- */}
      {activeTab === 'inventory' && (
      <>
        <div className="dashboard-controls">
            <button onClick={handleAddRow} disabled={validCategories.length === 0}>Add Product</button>
            <button onClick={handleDeleteRows} disabled={selectedRows.size === 0} className="delete-button">Delete Selected</button>
            <button onClick={handleSaveChanges} disabled={!hasChanges || isSaving} style={{backgroundColor: hasChanges ? 'var(--color-accent)' : ''}}>
            {isSaving ? 'Saving...' : 'Save All Changes'}
            </button>
        </div>
        
        {/* Products Section */}
        <div>
            <h2>Products</h2>
            <div className="search-controls">
            <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyPress={handleProductSearch} placeholder='Search Products (e.g., "SKU: P101" or "Category: Electronics")' className="search-input" />
            <button onClick={() => handleProductSearch()}>Search</button>
            {isProductSearchActive && <button onClick={() => { setProductSearch(''); setIsProductSearchActive(false); fetchInventory(null, null, true); }}>Clear</button>}
            </div>
            <div className="table-wrapper">
            <table>
                <thead>
                <tr>
                    <th><input type="checkbox" checked={selectedRows.size === sortedProducts.length && sortedProducts.length > 0} onChange={() => setSelectedRows(selectedRows.size === sortedProducts.length ? new Set() : new Set(sortedProducts.map(p => p.isNew ? p.id : p.sku)))} /></th>
                    <th onClick={() => requestProductSort('sku')} className="sortable">SKU{getSortIndicator('sku', productSortConfig)}</th>
                    <th>Default Name</th>
                    <th onClick={() => requestProductSort('category')} className="sortable">Category{getSortIndicator('category', productSortConfig)}</th>
                    <th>Stock</th><th>Status</th><th>Image URL</th><th>Actions</th>
                </tr>
                </thead>
                <tbody>
                {sortedProducts.map(product => {
                    const identifier = product.isNew ? product.id : product.sku;
                    const isDirty = !product.isNew && originalProducts.find(op => op.sku === product.sku) && JSON.stringify(product) !== JSON.stringify(originalProducts.find(op => op.sku === product.sku));
                    const rowClass = product.isDeleted ? 'is-deleted' : product.isNew ? 'is-new' : isDirty ? 'is-dirty' : '';
                    const isCategoryDeleted = !product.isDeleted && product.category && !validCategoryNames.has(product.category);
                    const isCategoryMissing = !product.isDeleted && !product.category;
                    const isSkuDuplicate = !product.isDeleted && product.sku && duplicateSkuSet.has(product.sku);

                    if (product.isDeleted) return (<tr key={identifier} className={rowClass}><td colSpan="8" style={{ textAlign: 'center' }}>Product flagged for deletion.</td></tr>);
                    
                    return (
                    <tr key={identifier} className={rowClass}>
                        <td data-label="Select"><input type="checkbox" checked={selectedRows.has(identifier)} onChange={() => handleSelectionChange(identifier)} /></td>
                        <td data-label="SKU" className={isSkuDuplicate ? 'cell-error' : ''}>
                        {product.isNew ? <input type="text" value={product.sku} onChange={(e) => handleInputChange(identifier, 'sku', e.target.value)} /> : product.sku}
                        </td>
                        <td data-label="Default Name">{product.localizations[0]?.productName || '(No Name)'}</td>
                        <td data-label="Category" className={isCategoryDeleted || isCategoryMissing ? 'cell-error' : ''}>
                        <select value={product.category} onChange={(e) => handleInputChange(identifier, 'category', e.target.value)}>
                            <option value="">-- Select --</option>
                            {isCategoryDeleted && <option value={product.category} style={{ color: 'red' }}>{product.category} (Deleted)</option>}
                            {validCategories.map(cat => <option key={cat.category} value={cat.category}>{cat.category}</option>)}
                        </select>
                        </td>
                        <td data-label="Stock"><input type="number" value={product.quantityInStock} onChange={(e) => handleInputChange(identifier, 'quantityInStock', e.target.value)} /></td>
                        <td data-label="Status">
                        <select value={product.productStatus} onChange={(e) => handleInputChange(identifier, 'productStatus', e.target.value)}>
                            {PRODUCT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        </td>
                        <td data-label="Image URL"><input type="text" value={product.imageUrl} onChange={(e) => handleInputChange(identifier, 'imageUrl', e.target.value)} /></td>
                        <td className="actions-cell">
                            <button onClick={() => handleOpenLocalizationModal(product)}>Localizations ({product.localizations.length})</button>
                            {product.isNew && <button onClick={() => handleRemoveNewRow(identifier)} className="delete-button">Remove</button>}
                        </td>
                    </tr>
                    );
                })}
                </tbody>
            </table>
            <div className="dashboard-footer">
                <button onClick={() => isProductSearchActive ? handleProductSearch(null, productNextToken) : fetchInventory(productNextToken)} disabled={!productNextToken || loading}>
                {loading && productNextToken ? 'Loading...' : `Load More ${isProductSearchActive ? 'Results' : 'Products'}`}
                </button>
            </div>
            </div>
        </div>
        
        {/* Categories Section */}
        <div className='section-buffer'>
            <div className="category-header">
                <h2>Product Categories</h2>
                {hasCategoryChanges && !isSaving && <span className="category-reminder">Unsaved changes pending.</span>}
            </div>
            <div className="category-manager">
            <div className="category-controls">
                <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="New category name" onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()} />
                <button onClick={handleAddCategory}>Add Category</button>
            </div>
            <div className="search-controls">
                <input type="text" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} onKeyPress={handleCategorySearch} placeholder="Search Categories" className="search-input" />
                <button onClick={() => handleCategorySearch()}>Search</button>
                {categorySearch && <button onClick={() => { setCategorySearch(''); setDisplayedCategories(categories); }}>Clear</button>}
            </div>
            <div className="table-wrapper">
                <table>
                <thead>
                    <tr>
                    <th onClick={() => requestCategorySort('category')} className="sortable">Category{getSortIndicator('category', categorySortConfig)}</th>
                    <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedCategories.map(cat => {
                        const originalCat = originalCategories.find(oc => oc.category === cat.category);
                        const isDirty = originalCat && JSON.stringify(cat) !== JSON.stringify(originalCat);
                        const rowClass = cat.isNew ? 'is-new' : isDirty ? 'is-dirty' : '';

                        if (cat.isDeleted) return (<tr key={cat.category} className="is-deleted"><td colSpan="2">Pending deletion.</td></tr>);
                        
                        return (
                        <tr key={cat.category} className={rowClass}>
                            <td data-label="Category">{cat.category}</td>
                            <td className="actions-cell">
                            <button onClick={() => handleOpenTranslationsModal(cat)}>Translations ({cat.translations?.length || 0})</button>
                            <button onClick={() => handleDeleteCategory(cat.category)} className="delete-button">Delete</button>
                            </td>
                        </tr>
                        )
                    })}
                </tbody>
                </table>
            </div>
            </div>
        </div>
      </>
      )}

      {/* --- LOGS TAB CONTENT --- */}
      {activeTab === 'logs' && (
      <div>
          <h2>PayPal Event Logs</h2>
          <div className="search-controls">
              <input 
                type="text" 
                value={logSearchOrderId} 
                onChange={(e) => setLogSearchOrderId(e.target.value)} 
                placeholder="Filter by Order ID" 
                className="search-input"
              />
              <button onClick={handleLogSearch}>Filter</button>
              {logSearchOrderId && <button onClick={() => { setLogSearchOrderId(''); fetchLogs(null, true); }}>Clear</button>}
          </div>

          <div className="table-wrapper">
              <table>
                  <thead>
                      <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Order ID</th>
                          <th>Summary</th>
                      </tr>
                  </thead>
                  <tbody>
                      {/* Mapping to logType and message as per new GraphQL Schema */}
                      {eventLogs.map((log) => (
                          <tr key={log.eventId}>
                              <td data-label="Date">
                                  {new Date(log.timestamp).toLocaleString()}
                                  <div style={{fontSize: '0.8rem', color: '#999'}}>{log.eventId}</div>
                              </td>
                              <td data-label="Type">
                                  <span className="event-type-badge">{log.eventType}</span>
                              </td>
                              <td data-label="Order ID">{log.orderId}</td>
                              <td data-label="Summary">{log.details}</td> 
                          </tr>
                      ))}
                      {eventLogs.length === 0 && !loading && (
                          <tr><td colSpan="4" style={{textAlign: 'center'}}>No events found.</td></tr>
                      )}
                  </tbody>
              </table>
              <div className="dashboard-footer">
                  <button onClick={() => fetchLogs(eventNextToken)} disabled={!eventNextToken || loading}>
                      {loading ? 'Loading...' : 'Load More Events'}
                  </button>
              </div>
          </div>
      </div>
      )}
    </div>
  );
}

export default Dashboard;