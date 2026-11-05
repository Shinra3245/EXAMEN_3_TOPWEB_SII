
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isPublic: boolean;

  constructor(
    statusCode: number,
    errorCode: string,
    message: string,
    isPublic = true
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isPublic = isPublic;
  }
}

export class ConfigurationError extends AppError {
  constructor(message = "Error de configuración interna del servidor") {
    super(503, "SERVER_CONFIGURATION_ERROR", message, true);
    this.name = "ConfigurationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(
    errorCode = "AUTHENTICATION_REQUIRED",
    message = "No autenticado o credenciales inválidas"
  ) {
    super(401, errorCode, message, true);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends AppError {
  constructor(
    errorCode = "FORBIDDEN",
    message = "Acceso denegado o solicitud no autorizada"
  ) {
    super(403, errorCode, message, true);
    this.name = "ForbiddenError";
  }
}

export class UpstreamError extends AppError {
  constructor(
    statusCode = 502,
    errorCode = "UPSTREAM_SERVICE_ERROR",
    message = "Error de comunicación con el servicio universitario upstream"
  ) {
    super(statusCode, errorCode, message, true);
    this.name = "UpstreamError";
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Error en la operación con la base de datos") {
    super(503, "DATABASE_ERROR", message, true);
    this.name = "DatabaseError";
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Datos de entrada no válidos",
    errorCode = "VALIDATION_ERROR"
  ) {
    super(422, errorCode, message, true);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "Conflicto con el estado actual del recurso",
    errorCode = "CONFLICT"
  ) {
    super(409, errorCode, message, true);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "Recurso no encontrado",
    errorCode = "NOT_FOUND"
  ) {
    super(404, errorCode, message, true);
    this.name = "NotFoundError";
  }
}

export function toSafeErrorResponse(
  error: unknown,
  fallbackMessage = "Error interno del servidor"
): Response {
  if (error instanceof AppError && error.isPublic) {
    return Response.json(
      {
        success: false,
        error: {
          code: error.errorCode,
          message: error.message,
        },
      },
      {
        status: error.statusCode,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  // Errores no controlados: NO exponer stacktrace ni detalles internos
  return Response.json(
    {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: fallbackMessage,
      },
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
