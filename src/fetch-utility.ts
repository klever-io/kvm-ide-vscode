import fetch from "node-fetch";
import { Feedback } from "./feedback";

export interface FetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface FetchContext {
    operation: string;
    url: string;
    additionalContext?: Record<string, any>;
}

export async function fetchWithDebugging(
    url: string,
    options: FetchOptions = {},
    context: FetchContext
): Promise<any> {
    const { operation, additionalContext = {} } = context;
    
    let response: any;
    let responseText: string = "";
    
    try {
        Feedback.debug({
            message: `Initiating ${operation} request...`,
            items: [
                { label: "URL", detail: url },
                { label: "Method", detail: options.method || "GET" },
                { label: "Headers", detail: JSON.stringify(options.headers || {}, null, 2) },
                ...Object.entries(additionalContext).map(([key, value]) => ({ 
                    label: key, 
                    detail: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                }))
            ],
        });

        response = await fetch(url, options);
        
        // Get response text for debugging regardless of success/failure
        try {
            responseText = await response.text();
        } catch (textError) {
            responseText = `[Could not read response text: ${textError}]`;
        }

        Feedback.debug({
            message: `${operation} request completed with status ${response.status}`,
            items: [
                { label: "Status", detail: `${response.status} ${response.statusText}` },
                { label: "URL", detail: url },
                { label: "Response Headers", detail: (() => {
                    const headers: any = {};
                    response.headers.forEach((value: string, key: string) => {
                        headers[key] = value;
                    });
                    return JSON.stringify(headers, null, 2);
                })() },
                { label: "Response Body", detail: responseText },
                ...Object.entries(additionalContext).map(([key, value]) => ({ 
                    label: key, 
                    detail: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                }))
            ],
        });

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status} ${response.statusText}`;
            
            // Try to parse error response for more details
            try {
                const errorData = JSON.parse(responseText);
                if (errorData.error) {
                    errorMessage += `: ${errorData.error}`;
                }
                if (errorData.message) {
                    errorMessage += ` - ${errorData.message}`;
                }
            } catch {
                // If parsing fails, use raw response text
                if (responseText && responseText.length > 0) {
                    errorMessage += `: ${responseText}`;
                }
            }

            // Log specific error for debugging
            Feedback.debug({
                message: `${operation} request failed with detailed error information`,
                items: [
                    { label: "Error Type", detail: "HTTP Error" },
                    { label: "Status Code", detail: response.status.toString() },
                    { label: "Status Text", detail: response.statusText },
                    { label: "URL", detail: url },
                    { label: "Raw Response", detail: responseText },
                    { label: "Content-Type", detail: response.headers.get('content-type') || 'unknown' },
                    ...Object.entries(additionalContext).map(([key, value]) => ({ 
                        label: key, 
                        detail: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                    }))
                ],
            });

            throw new Error(`${operation} request failed: ${errorMessage}`);
        }

        // Parse successful response
        let data: any;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            Feedback.debug({
                message: `Failed to parse ${operation} response as JSON`,
                items: [
                    { label: "Parse Error", detail: parseError.toString() },
                    { label: "Raw Response", detail: responseText },
                    { label: "Response Length", detail: responseText.length.toString() }
                ],
            });
            throw new Error(`Invalid JSON response from ${operation}: ${parseError}`);
        }

        Feedback.debug({
            message: `${operation} request successful`,
            items: [
                { label: "Response Data", detail: JSON.stringify(data, null, 2) },
                ...Object.entries(additionalContext).map(([key, value]) => ({ 
                    label: key, 
                    detail: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                }))
            ],
        });

        return data;
        
    } catch (error: any) {
        // Enhanced error logging with full context
        const errorContext = {
            operation: operation,
            url: url,
            timestamp: new Date().toISOString(),
            errorType: error.constructor.name,
            errorMessage: error.message,
            errorStack: error.stack,
            httpStatus: response?.status || 'unknown',
            httpStatusText: response?.statusText || 'unknown',
            responseText: responseText,
            cause: error.cause,
            ...additionalContext
        };

        Feedback.debug({
            message: `${operation} request failed with comprehensive error details`,
            items: [
                { label: "Operation", detail: errorContext.operation },
                { label: "Timestamp", detail: errorContext.timestamp },
                { label: "URL", detail: errorContext.url },
                { label: "Error Type", detail: errorContext.errorType },
                { label: "Error Message", detail: errorContext.errorMessage },
                { label: "HTTP Status", detail: `${errorContext.httpStatus} ${errorContext.httpStatusText}` },
                { label: "Response Text", detail: errorContext.responseText || 'No response text' },
                { label: "Stack Trace", detail: errorContext.errorStack || 'No stack trace' },
                { label: "Original Cause", detail: errorContext.cause ? JSON.stringify(errorContext.cause, null, 2) : 'No cause' },
                ...Object.entries(additionalContext).map(([key, value]) => ({ 
                    label: key, 
                    detail: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                }))
            ],
        });

        throw error;
    }
}

export function createUserFriendlyErrorMessage(error: any, defaultMessage: string): string {
    let userMessage = defaultMessage;
    
    if (error.message.includes('fetch')) {
        userMessage = "Network error: Unable to connect to service";
    } else if (error.message.includes('HTTP 429')) {
        userMessage = "Rate limit exceeded: Please wait before making another request";
    } else if (error.message.includes('HTTP 400')) {
        userMessage = "Invalid request: Please check your input";
    } else if (error.message.includes('HTTP 500')) {
        userMessage = "Service error: Please try again later";
    } else if (error.message.includes('JSON')) {
        userMessage = "Response parsing error: Received invalid data from service";
    }

    return `${userMessage}. Check VS Code output console for detailed error information.`;
}