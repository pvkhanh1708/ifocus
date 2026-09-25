import { useEffect, useState } from "react";
import { apiRequest } from "../utils/api";

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
    const [storedValue, setStoredValue] = useState<T>(initialValue);

    useEffect(() => {
        let active = true;
        apiRequest<{ data: Record<string, unknown> }>("/api/data")
            .then((response) => {
                if (active && response.data[key] !== undefined) {
                    setStoredValue(response.data[key] as T);
                }
            })
            .catch((error) => console.error("Không thể đọc dữ liệu:", error));
        return () => {
            active = false;
        };
    }, [key]);

    const setValue = (value: T | ((val: T) => T)) => {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        void apiRequest("/api/data", {
            method: "PATCH",
            body: JSON.stringify({ key, value: valueToStore }),
        }).catch((error) => console.error("Không thể lưu dữ liệu:", error));
    };

    return [storedValue, setValue];
}
