// src/components/LocalizationModal.jsx
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import Spinner from './Spinner';
import './LocalizationModal.css';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

const createNewLocalization = (categoryText) => ({
  lang: '',
  country: '',
  categoryText: categoryText,
  productName: '',
  description: '',
  price: 0.0,
  currency: 'USD',
  _tempId: `NEW_LOC_${Date.now()}`
});

function LocalizationModal({ product, isOpen, onClose, onSave }) {
  const [localizations, setLocalizations] = useState([]);
  const [originalLocalizations, setOriginalLocalizations] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (product && product.localizations) {
      const copiedLocalizations = deepCopy(product.localizations);
      setLocalizations(copiedLocalizations);
      setOriginalLocalizations(deepCopy(copiedLocalizations));
    }
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const handleInputChange = (index, field, value) => {
    const updatedLocalizations = [...localizations];
    const item = updatedLocalizations[index];
    updatedLocalizations[index] = { ...item, [field]: value };
    setLocalizations(updatedLocalizations);
  };

  const handleAddLocalization = () => {
    setLocalizations([...localizations, createNewLocalization(product.category)]);
  };

  const handleDeleteLocalization = (indexToDelete) => {
    if (localizations.length <= 1) {
      alert('A product must have at least one localization.');
      return;
    }
    setLocalizations(localizations.filter((_, index) => index !== indexToDelete));
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError('');

    for (const loc of localizations) {
      if (!loc.lang || !loc.country || !loc.productName) {
        setError('Please fill in Lang, Country, and Product Name for all localizations.');
        setIsSaving(false);
        return;
      }
    }

    const mutations = [];
    const sku = product.sku;

    originalLocalizations.forEach(origLoc => {
      if (!localizations.some(l => l.lang === origLoc.lang && l.country === origLoc.country)) {
        mutations.push(apiService.removeLocalization(sku, origLoc.lang, origLoc.country));
      }
    });

    localizations.forEach(loc => {
      const original = originalLocalizations.find(ol => ol.lang === loc.lang && ol.country === loc.country);
      
      // --- FIX: Prepare the payload directly, keeping camelCase. ---
      // Remove the temporary ID and ensure price is a number.
      const { _tempId, ...locData } = loc;
      const localizationPayload = {
        ...locData,
        price: parseFloat(locData.price) || 0,
      };

      if (loc._tempId) { // It's a new one
        mutations.push(apiService.addLocalization(sku, localizationPayload));
      } else if (original && JSON.stringify(loc) !== JSON.stringify(original)) { // It's updated
        mutations.push(apiService.updateLocalization(sku, localizationPayload));
      }
    });

    if (mutations.length === 0) {
      onClose();
      return;
    }

    try {
      const results = await Promise.allSettled(mutations);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        throw new Error(failures.map(f => f.reason.message).join(', '));
      }
      
      const successfulResults = results.filter(r => r.status === 'fulfilled');
      const lastResult = successfulResults[successfulResults.length - 1].value;
      const finalProductState = lastResult.updateLocalization || lastResult.addLocalization || lastResult.removeLocalization;
      
      if (!finalProductState) {
        throw new Error("Could not retrieve updated product state from API response.");
      }

      onSave(finalProductState);
    } catch (err) {
      setError(`Failed to save changes: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* ... (Spinner and modal header are the same) ... */}
        <div className="modal-body">
          {error && <p className="error-message" style={{marginBottom: '1rem'}}>{error}</p>}
          <table>
            <thead>
              <tr>
                <th>Language</th>
                <th>Country</th>
                <th>Product Name</th>
                <th>Category Text</th>
                <th>Description</th>
                <th>Price</th>
                <th>Currency</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {localizations.map((loc, index) => (
                <tr key={loc._tempId || `${loc.lang}-${loc.country}`}>
                  <td><input type="text" value={loc.lang} placeholder="en" onChange={e => handleInputChange(index, 'lang', e.target.value)} /></td>
                  <td><input type="text" value={loc.country} placeholder="us" onChange={e => handleInputChange(index, 'country', e.target.value)} /></td>
                  <td><input type="text" value={loc.productName} onChange={e => handleInputChange(index, 'productName', e.target.value)} /></td>
                  
                  {/* --- FIX IS HERE: The input is now enabled and editable --- */}
                  <td>
                    <input
                      type="text"
                      value={loc.categoryText}
                      onChange={e => handleInputChange(index, 'categoryText', e.target.value)}
                    />
                  </td>
                  
                  <td><textarea value={loc.description} onChange={e => handleInputChange(index, 'description', e.target.value)} /></td>
                  <td><input type="number" step="0.01" value={loc.price} onChange={e => handleInputChange(index, 'price', e.target.value)} /></td>
                  <td><input type="text" value={loc.currency} onChange={e => handleInputChange(index, 'currency', e.target.value)} /></td>
                  <td>
                    <button className="delete-loc-button" onClick={() => handleDeleteLocalization(index)} disabled={localizations.length <= 1}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="modal-footer">
          <button onClick={handleAddLocalization}>Add New Localization</button>
          <div>
            <button className="cancel-button" onClick={onClose}>Cancel</button>
            <button className="save-button" onClick={handleSaveChanges}>Save Changes</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default LocalizationModal;