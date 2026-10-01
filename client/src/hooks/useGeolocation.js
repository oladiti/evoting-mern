import { useState, useCallback } from 'react';

export function useGeolocation() {
  const [state, setState] = useState({ status: 'idle', lat: null, lng: null, error: null });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: 'error', lat: null, lng: null, error: 'Geolocation is not supported by this browser.' });
      return;
    }
    setState((s) => ({ ...s, status: 'requesting', error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'success',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          error: null,
        });
      },
      (err) => {
        let msg = 'Unable to determine your location.';
        if (err.code === 1) msg = 'Location permission denied. Please enable location access to vote.';
        if (err.code === 2) msg = 'Location unavailable. Please try again.';
        if (err.code === 3) msg = 'Location request timed out. Please try again.';
        setState({ status: 'error', lat: null, lng: null, error: msg });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  return { ...state, request };
}
