import React from 'react';
import './OrdersDetailModal.css';

const OrderDetailsModal = ({ isOpen, onClose, details, loading }) => {
    if (!isOpen) return null;

    // Extract the inner object if the API returns it wrapped
    const orderData = details?.getOrderDetails ? details.getOrderDetails : details;

    const formatCurrency = (val, currency) => {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency || 'USD',
            }).format(val || 0);
        } catch (e) {
            return `${currency || '$'}${val || 0}`;
        }
    };

    // Strict check for products
    const hasProducts = orderData?.products && Array.isArray(orderData.products) && orderData.products.length > 0;

    return (
        <div className="modal-overlay">
            <div className="modal-container dark-theme">
                <div className="modal-header">
                    <h2 style={{ color: '#ffffff', margin: 0 }}>Order Items</h2>
                    <button className="close-button" onClick={onClose} style={{ color: '#ffffff' }}>&times;</button>
                </div>

                <div className="modal-body" style={{ padding: '20px', overflowY: 'auto' }}>
                    {loading ? (
                        <div className="loading-spinner-text">Loading order details...</div>
                    ) : hasProducts ? (
                        <>
                            <table className="inventory-table">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Quantity</th>
                                        <th>Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderData.products.map((item, idx) => (
                                        <tr key={idx}>
                                            <td>{item.sku}</td>
                                            <td>{item.quantity}</td>
                                            <td>{formatCurrency(item.price, orderData.currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="order-total-display">
                                Total: {formatCurrency(orderData.amount, orderData.currency)}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state-container">
                            <p className="empty-state-text">No products found for this order.</p>
                        </div>
                    )}
                </div>

                <div className="modal-footer" style={{ borderTop: '1px solid #333' }}>
                    <button className="secondary-button" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailsModal;