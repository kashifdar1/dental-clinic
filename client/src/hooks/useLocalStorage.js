import { useEffect, useState } from 'react';

export const useLocalStorage = (key, defaultValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Failed to read from localStorage', error);
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStorage = (event) => {
      if (event.key && event.key !== key) return;
      try {
        const nextValue = event.newValue ? JSON.parse(event.newValue) : defaultValue;
        setStoredValue(nextValue);
      } catch (error) {
        console.error('Failed to parse localStorage event', error);
      }
    };

    const handleCustom = (event) => {
      if (!event.detail || event.detail.key !== key) return;
      setStoredValue(event.detail.value);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('brightsmile-storage', handleCustom);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('brightsmile-storage', handleCustom);
    };
  }, [defaultValue, key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
      const customEvent = new CustomEvent('brightsmile-storage', {
        detail: { key, value: storedValue },
      });
      window.dispatchEvent(customEvent);
    } catch (error) {
      console.error('Failed to write to localStorage', error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
};
