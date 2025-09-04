// src/components/CategoryTranslationsModal.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/apiService';
import './CategoryTranslationsModal.css';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

function CategoryTranslationsModal({ isOpen, onClose, category, onSave }) {
  const [translations, setTranslations] = useState([]);
  const [originalTranslations, setOriginalTranslations] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [newText, setNewText] = useState('');

  // isDirty check is still useful to enable/disable the save button
  const isDirty = useMemo(() => 
    JSON.stringify(translations) !== JSON.stringify(originalTranslations),
    [translations, originalTranslations]
  );

  useEffect(() => {
    if (category?.translations) {
      const initialTranslations = deepCopy(category.translations);
      setTranslations(initialTranslations);
      setOriginalTranslations(initialTranslations);
    } else {
      setTranslations([]);
      setOriginalTranslations([]);
    }
    setNewLang('');
    setNewText('');
    setIsSaving(false);
  }, [category]);

  if (!isOpen) {
    return null;
  }

  const handleLangChange = (e) => {
    setNewLang(e.target.value.toLowerCase().slice(0, 2));
  };

  const handleAddTranslation = () => {
    const lang = newLang.trim();
    const text = newText.trim();
    if (!lang || !text) return alert('Language code and text cannot be empty.');
    if (lang.length !== 2) return alert('Language code must be exactly two letters.');
    if (translations.some(t => t.lang === lang)) return alert('A translation for this language code already exists.');
    
    setTranslations(current => [...current, { lang, text }]);
    setNewLang('');
    setNewText('');
  };

  const handleRemoveTranslation = (langToRemove) => {
    setTranslations(translations.filter(t => t.lang !== langToRemove));
  };
  
  const handleUpdateTranslationText = (lang, newTextValue) => {
    setTranslations(
        translations.map(t => t.lang === lang ? { ...t, text: newTextValue } : t)
    );
  };

  // THIS IS YOUR ORIGINAL, CORRECT IMPLEMENTATION
  const handleSaveChanges = async () => {
    setIsSaving(true);
    // The API expects an object containing the category name and the full list of translations
    const input = {
      category: category.category,
      translations: translations.map(({ lang, text }) => ({ lang, text }))
    };

    try {
      // Assuming the API returns the updated category object or we can construct it
      // For this example, we'll construct it to ensure the parent has the latest data.
      await apiService.upsertCategoryTranslation(input); 
      
      const updatedCategory = { ...category, translations: input.translations };
      onSave(updatedCategory); // Notify parent to refresh and close the modal.
    } catch (error) {
      console.error("Failed to save category translations:", error);
      alert(`Error saving changes: ${error.message}`);
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="category-translations-modal-overlay">
      <div className="category-translations-modal-content">
        <h2>Manage Translations for "{category.category}"</h2>
        <fieldset disabled={isSaving} className="form-fieldset">
          {/* ... JSX for inputs and list ... */}
          <div className="translations-list">
              {translations.map(trans => (
                  <div key={trans.lang} className="translation-item">
                      <span className="lang-code">{trans.lang}</span>
                      <input type="text" value={trans.text} onChange={(e) => handleUpdateTranslationText(trans.lang, e.target.value)} />
                      <button onClick={() => handleRemoveTranslation(trans.lang)} className="delete-button-small">Remove</button>
                  </div>
              ))}
          </div>
          <div className="add-translation-form">
              <h3>Add New Translation</h3>
              <input type="text" placeholder="Language Code (e.g., 'es')" value={newLang} onChange={handleLangChange} maxLength="2" />
              <input type="text" placeholder="Translated Text" value={newText} onChange={e => setNewText(e.target.value)} />
              <button type="button" onClick={handleAddTranslation}>Add</button>
          </div>
        </fieldset>
        <div className="modal-actions">
          <button onClick={handleCancel} className="secondary-button" disabled={isSaving}>Cancel</button>
          <button onClick={handleSaveChanges} disabled={!isDirty || isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CategoryTranslationsModal;