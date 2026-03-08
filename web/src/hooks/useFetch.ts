import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/axios';
import type { AxiosRequestConfig, AxiosError } from 'axios';

interface UseFetchResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | AxiosError | null;
    refetch: () => Promise<void>;
}

/**
 * Custom hook for data fetching using Axios instance.
 */
export function useFetch<T>(url: string, options?: AxiosRequestConfig): UseFetchResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | AxiosError | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<T>(url, options);
            setData(response.data);
        } catch (err) {
            setError(err as Error | AxiosError);
        } finally {
            setLoading(false);
        }
    }, [url, options]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, refetch: fetchData };
}
