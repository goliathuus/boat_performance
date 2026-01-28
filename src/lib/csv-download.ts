/**
 * Download CSV content as a file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  // Create blob with UTF-8 encoding
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename for CSV export
 */
export function generateCSVFilename(sessionName?: string, isMultiSession = false): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  
  if (isMultiSession) {
    return `boat_tracker_export_${timestamp}.csv`;
  }
  
  if (sessionName) {
    // Sanitize session name for filename
    const sanitizedName = sessionName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return `session_${sanitizedName}_${timestamp}.csv`;
  }
  
  return `boat_tracker_export_${timestamp}.csv`;
}








