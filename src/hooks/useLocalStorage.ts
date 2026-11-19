import { useCallback, useRef, useState } from "react";
import { DEFAULT_SAVE_DELAY_MS, getSetting, saveSetting } from "../stores/settings";

/**
 * A persisted UI setting (name kept from the original localStorage version).
 *
 * The initial value comes from the settings loaded with the app (no request
 * per hook), and changes are saved to the server debounced. Use a longer
 * `saveDelayMs` for values that change continuously (e.g. a running timer):
 * they are then saved when they settle or when the page is hidden.
 */
export function useLocalStorage<T>(
    key: string,
    initialValue: T,
    saveDelayMs = DEFAULT_SAVE_DELAY_MS
): [T, (value: T | ((val: T) => T)) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => getSetting(key, initialValue));
    // Latest value, so functional updates fired in quick succession chain correctly.
    const valueRef = useRef(storedValue);

    const setValue = useCallback(
        (value: T | ((val: T) => T)) => {
            const next = value instanceof Function ? value(valueRef.current) : value;
            valueRef.current = next;
            setStoredValue(next);
            saveSetting(key, next, saveDelayMs);
        },
        [key, saveDelayMs]
    );

    return [storedValue, setValue];
}
