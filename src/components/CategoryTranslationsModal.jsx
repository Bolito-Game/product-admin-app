// src/components/CategoryTranslationsModal.jsx

import React, { useState, useEffect } from 'react';
import './CategoryTranslationsModal.css';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

function CategoryTranslationsModal({ isOpen, onClose, category, onSave }) {
  const [translations, setTranslations] = useState([]);
  const [newLang, setNewLang] = useState('');
  const [newText, setNewText] = useState('');

  useEffect(() => {
    if (category?.translations) {
      setTranslations(deepCopy(category.translations));
    } else {
      setTranslations([]);
    }
    setNewLang('');
    setNewText('');
  }, [category]);

  if (!isOpen) {
    return null;
  }

  const handleAddTranslation = () => {
    if (!newLang.trim() || !newText.trim()) {
      alert('Language code and text cannot be empty.');
      return;
    }
    if (translations.some(t => t.lang.toLowerCase() === newLang.trim().toLowerCase())) {
        alert('A translation for this language code already exists.');
        return;
    }
    const newTranslation = { lang: newLang.trim(), text: newText.trim() };
    setTranslations(currentTranslations => [...currentTranslations, newTranslation]);
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

  const handleSaveChanges = () => {
    onSave({ ...category, translations });
  };

  return (
    // --- FIX: Using the new specific class name for the overlay ---
    <div className="category-translations-modal-overlay">
      {/* --- FIX: Using the new specific class name for the content --- */}
      <div className="category-translations-modal-content">
        <h2>Manage Translations for "{category.category}"</h2>
        
        <div className="translations-list">
            {translations.length > 0 ? translations.map(trans => (
                <div key={trans.lang} className="translation-item">
                    <span className="lang-code">{trans.lang}</span>
                    <input 
                        type="text" 
                        value={trans.text}
                        onChange={(e) => handleUpdateTranslationText(trans.lang, e.target.value)}
                    />
                    <button onClick={() => handleRemoveTranslation(trans.lang)} className="delete-button-small">
                        Remove
                    </button>
                </div>
            )) : <p>No translations yet. Add one below.</p>}
        </div>

        <div className="add-translation-form">
            <h3>Add New Translation</h3>
            <input 
                type="text" 
                placeholder="Language Code (e.g., 'es')"
                value={newLang}
                onChange={e => setNewLang(e.target.value)}
            />
            <input 
                type="text" 
                placeholder="Translated Text"
                value={newText}
                onChange={e => setNewText(e.target.value)}
            />
            <button onClick={handleAddTranslation}>Add</button>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="secondary-button">Cancel</button>
          <button onClick={handleSaveChanges}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

export default CategoryTranslationsModal;