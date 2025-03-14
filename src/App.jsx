// src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { ToastContainer, toast } from 'react-toastify'; 
import 'react-toastify/dist/ReactToastify.css'; 
import './App.css';
import { FiCopy } from "react-icons/fi"; 

function App() {
    const [coupon, setCoupon] = useState(null);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [remainingTime, setRemainingTime] = useState(0);
    const [isBlocked, setIsBlocked] = useState(false);

    useEffect(() => {
        if (!Cookies.get('coupon_user_id')) {
            console.log("No cookie found, but it will be set when user claims a coupon.");
        }
    }, []);

    const getCoupon = async () => {
        if (isLoading || isBlocked) return; 

        setIsLoading(true);
        setMessage('');
        setIsBlocked(false);
        setRemainingTime(0);

        try {
            const response = await axios.get('http://localhost:4001/api/coupon', { withCredentials: true });
            setCoupon(response.data.couponCode);
            setMessage(response.data.message);
            toast.success(`Coupon claimed successfully!`);
        } catch (error) {
            if (error.response && error.response.status === 429) {
                setMessage(error.response.data.message);
                setRemainingTime(error.response.data.remainingTime);
                setIsBlocked(true);
                startCountdown(error.response.data.remainingTime);
                toast.error(`Too many requests! Wait 1 hours.`);
            } else {
                setMessage('Failed to get coupon: ' + error.message);
                setCoupon(null);
                toast.error('Failed to claim coupon!');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const startCountdown = (time) => {
        if (time > 0) {
            setRemainingTime(time);
            const interval = setInterval(() => {
                setRemainingTime(prevTime => {
                    if (prevTime <= 1) {
                        clearInterval(interval);
                        return 0;
                    }
                    return prevTime - 1;
                });
            }, 1000);
        }
    };

    const copyToClipboard = (couponCode) => {
        navigator.clipboard.writeText(couponCode)
            .then(() => {
                console.log('Coupon code copied to clipboard!');
                toast.success('Coupon code copied to clipboard!');
            })
            .catch((err) => {
                console.error('Failed to copy coupon code:', err);
                toast.error('Failed to copy coupon code.');
            });
    };

    return (
        <div className="App">
            <ToastContainer position="top-center" autoClose={3000} hideProgressBar={false} />
            <h1>Coupon Distribution</h1>
            {isBlocked && (
                <div className="message">Too many requests. Please wait {Math.round(remainingTime)} seconds.</div>
            )}
            {coupon && (
                <div className="coupon">
                    Your Coupon Code: <strong>{coupon}</strong>
                    <button className="copy-button" onClick={() => copyToClipboard(coupon)}>
                        <FiCopy className="copy-icon" />
                    </button>
                </div>
            )}
            {!coupon && (
                <>
                    <button onClick={getCoupon} disabled={isLoading || isBlocked}>
                        {isLoading ? 'Loading...' : <span>Get Coupon</span>}
                    </button>
                </>
            )}
        </div>
    );
}

export default App;
