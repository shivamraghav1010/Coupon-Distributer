// frontend/src/App.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import { FaSpinner, FaGift } from 'react-icons/fa';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const claimCoupon = async () => {
    setIsLoading(true);
    setMessage('');
    setCouponCode('');

    try {
      const response = await axios.get('/api/claim-coupon', {
        withCredentials: true,
      });

      const { success, message, coupon } = response.data;

      setMessage(message);
      setCouponCode(coupon || '');
      setIsSuccess(success);

      if (success) {
        toast.success(`Coupon ${coupon} claimed!`, { position: 'top-right' });
      } else {
        toast.warn(message, { position: 'top-right' }); // Use warn for non-error failures like 429
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'An error occurred while claiming the coupon';
      setMessage(errorMsg);
      setIsSuccess(false);
      if (error.response?.status === 429) {
        toast.warn(errorMsg, { position: 'top-right' }); // Specific handling for 429
      } else {
        toast.error(errorMsg, { position: 'top-right' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>Claim Your Coupon</h1>
      <button onClick={claimCoupon} disabled={isLoading}>
        {isLoading ? <FaSpinner className="spin" /> : <FaGift />}
        {isLoading ? ' Claiming...' : ' Get Coupon'}
      </button>
      {message && (
        <div className={`message ${isSuccess ? 'success' : 'error'}`}>
          {message}
          {isSuccess && couponCode && (
            <p>Your coupon code: <strong>{couponCode}</strong></p>
          )}
        </div>
      )}
      <ToastContainer />
    </div>
  );
}

export default App;