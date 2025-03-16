// frontend/src/App.jsx
import React, { useState } from 'react';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Add loading state

  const claimCoupon = async () => {
    setIsLoading(true); // Start loading
    setMessage(''); // Clear previous message
    
    try {
      const response = await fetch('https://coupon-distributer-1.onrender.com/api/claim-coupon', {
        credentials: 'include', // Include cookies for session tracking
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setMessage(data.message);
      setIsSuccess(data.success);
    } catch (error) {
      console.error('Error claiming coupon:', error);
      setMessage(error.message === 'Failed to fetch' 
        ? 'Network error: Please check your connection' 
        : 'An error occurred while claiming the coupon');
      setIsSuccess(false);
    } finally {
      setIsLoading(false); // Stop loading
    }
  };

  return (
    <div className="App">
      <h1>Claim Your Coupon</h1>
      <button onClick={claimCoupon} disabled={isLoading}>
        {isLoading ? 'Claiming...' : 'Get Coupon'}
      </button>
      {message && (
        <div className={`message ${isSuccess ? 'success' : 'error'}`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default App;