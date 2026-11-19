import { create } from "zustand";
import { ApiError } from "../utils/api";

/**
 * Tracks whether the last save to the server failed, so the UI can warn the
 * user instead of silently losing changes.
 */
interface SyncStatusState {
    error: string | null;
}

export const useSyncStatus = create<SyncStatusState>()(() => ({ error: null }));

export const reportSaveError = (error: unknown) => {
    // 401 is handled by sending the user back to the login screen.
    if (error instanceof ApiError && error.status === 401) return;
    const message = error instanceof Error ? error.message : "Không lưu được dữ liệu.";
    useSyncStatus.setState({ error: message });
};

export const reportSaveSuccess = () => {
    if (useSyncStatus.getState().error !== null) useSyncStatus.setState({ error: null });
};
