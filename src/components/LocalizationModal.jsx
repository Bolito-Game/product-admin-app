import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import Spinner from './Spinner';
import './LocalizationModal.css';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

const createNewLocalization = () => ({
  lang: '',
  country: '',
  productName: '',
  description: '',
  price: 0.0,
  currency: 'USD',
  // This temporary ID marks the entry as new and not persisted.
  _tempId: `NEW_LOC_${Date.now()}`
});

function LocalizationModal({ product, isOpen, onClose, onSave }) {
  const [localizations, setLocalizations] = useState([]);
  const [originalLocalizations, setOriginalLocalizations] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (product && product.localizations) {
      const copiedLocalizations = deepCopy(product.localizations);
      setLocalizations(copiedLocalizations);
      setOriginalLocalizations(deepCopy(copiedLocalizations));
      setSubmitted(false);
      setError('');
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
    setLocalizations([...localizations, createNewLocalization()]);
  };

  const handleDeleteLocalization = (indexToDelete) => {
    if (localizations.length <= 1) {
      alert('A product must have at least one localization.');
      return;
    }
    setLocalizations(localizations.filter((_, index) => index !== indexToDelete));
  };

  const handleSaveChanges = async () => {
    setSubmitted(true);
    setError('');

    // Validate all localizations
    for (const loc of localizations) {
      if (!loc.lang || !loc.country || !loc.productName) {
        setError('Please fill in Language, Country, and Product Name for all localizations.');
        return;
      }
    }

    if (product.isNew) {
      // For new products, update the local state
      const cleanedLocalizations = localizations.map(({ _tempId, ...loc }) => ({
        ...loc,
        price: parseFloat(loc.price) || 0
      }));
      const updatedProductForState = { ...product, localizations: cleanedLocalizations };
      onSave(updatedProductForState);
    } else {
      setIsSaving(true);
      try {
        // Collect all localizations to update or add
        const localizationsToUpdate = localizations.map(({ _tempId, ...loc }) => ({
          ...loc,
          price: parseFloat(loc.price) || 0
        }));

        // Identify localizations to remove
        const localizationsToRemove = originalLocalizations.filter(
          origLoc => !localizations.some(l => l.lang === origLoc.lang && l.country === origLoc.country)
        );

        // Execute mutations
        let finalProductState;
        if (localizationsToUpdate.length > 0) {
          // Use updateLocalization for both new and existing localizations
          const result = await apiService.updateLocalization(product.sku, localizationsToUpdate);
          finalProductState = result.updateLocalization;
        }

        if (localizationsToRemove.length > 0) {
          // Remove deleted localizations
          const removePromises = localizationsToRemove.map(loc =>
            apiService.removeLocalization(product.sku, loc.lang, loc.country)
          );
          const removeResults = await Promise.allSettled(removePromises);
          const removeFailures = removeResults.filter(r => r.status === 'rejected');
          if (removeFailures.length > 0) {
            throw new Error(removeFailures.map(f => f.reason.message).join(', '));
          }
          // Use the last successful remove result to update the product state
          const lastRemoveResult = removeResults[removeResults.length - 1].value;
          finalProductState = lastRemoveResult.removeLocalization || finalProductState;
        }

        if (!finalProductState) {
          throw new Error("Could not retrieve updated product state from API response.");
        }
        onSave(finalProductState);
      } catch (err) {
        setError(`Failed to save changes: ${err.message}`);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <Spinner show={isSaving} />
        <header className="modal-header">
          <h2>Edit Localizations for {product.isNew ? `New Product (${product.sku || 'No SKU'})` : `SKU: ${product.sku}`}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </header>
        <div className="modal-body">
          {error && <p className="error-message" style={{marginBottom: '1rem'}}>{error}</p>}
          <table>
            <thead>
              <tr>
                <th>Language</th>
                <th>Country</th>
                <th>Product Name</th>
                <th>Description</th>
                <th>Price</th>
                <th>Currency</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {localizations.map((loc, index) => {
                const isPersisted = !loc._tempId;

                return (
                  <tr key={loc._tempId || `${loc.lang}-${loc.country}`}>
                    <td>
                      <input
                        type="text"
                        value={loc.lang}
                        placeholder="en"
                        maxLength="2"
                        className={submitted && !loc.lang ? 'input-error' : ''}
                        onChange={e => handleInputChange(index, 'lang', e.target.value)}
                        disabled={isPersisted}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={loc.country}
                        placeholder="us"
                        maxLength="2"
                        className={submitted && !loc.country ? 'input-error' : ''}
                        onChange={e => handleInputChange(index, 'country', e.target.value)}
                        disabled={isPersisted}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={loc.productName}
                        className={submitted && !loc.productName ? 'input-error' : ''}
                        onChange={e => handleInputChange(index, 'productName', e.target.value)}
                      />
                    </td>
                    <td>
                      <textarea
                        value={loc.description}
                        onChange={e => handleInputChange(index, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={loc.price}
                        onChange={e => handleInputChange(index, 'price', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={loc.currency}
                        onChange={e => handleInputChange(index, 'currency', e.target.value)}
                      />
                    </td>
                    <td>
                      <button className="delete-loc-button" onClick={() => handleDeleteLocalization(index)} disabled={localizations.length <= 1}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
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