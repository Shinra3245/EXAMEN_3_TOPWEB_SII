export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export interface DatabaseCheckData {
  connected: boolean;
  read: boolean;
  write: boolean;
  rollback: boolean;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
