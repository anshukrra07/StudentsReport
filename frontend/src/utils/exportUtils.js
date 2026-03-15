import * as XLSX from 'xlsx';

export const exportToExcel = (data, filename = 'report') => {
  if (!data || data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToCSV = (data, filename = 'report') => {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(','), ...data.map(row =>
    headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
  )];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportToPDF = (title, headers, rows, filename = 'report') => {
  // Dynamic import to avoid bundle issues
  Promise.all([
    import('jspdf').catch(() => null),
    import('jspdf-autotable').catch(() => null),
  ]).then(([jspdfModule]) => {
    if (!jspdfModule) {
      alert('PDF export requires the jspdf package.\nRun: npm install jspdf jspdf-autotable');
      return;
    }
    const { default: jsPDF } = jspdfModule;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 23);
    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        head: [headers],
        body: rows,
        startY: 28,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] }
      });
    } else {
      // Fallback: plain text rows if autoTable plugin didn't load
      let y = 32;
      doc.setFontSize(8);
      rows.forEach(row => {
        doc.text(row.map(String).join('   '), 14, y);
        y += 8;
        if (y > 190) { doc.addPage(); y = 14; }
      });
    }
    doc.save(`${filename}.pdf`);
  });
};

export const flattenForExport = (data, type) => {
  if (!data) return [];
  switch (type) {
    case 'attendance':
      return data.map(s => ({
        'Roll Number': s.rollNumber,
        'Name': s.name,
        'Department': s.department,
        'Section': s.section,
        'Batch': s.batch,
        'Subjects Count': s.attendance?.length || s.lowSubjects?.length || 0
      }));
    case 'marks':
      return data.map(s => ({
        'Roll Number': s.rollNumber,
        'Name': s.name,
        'Department': s.department,
        'Section': s.section,
        'CGPA': s.cgpa,
        'Semesters': s.semesters?.length || 0
      }));
    case 'backlogs':
      return data.map(s => ({
        'Roll Number': s.rollNumber,
        'Name': s.name,
        'Department': s.department,
        'Section': s.section,
        'Batch': s.batch,
        'Backlog Count': s.backlogCount,
        'Backlogs': s.backlogs?.join(', ')
      }));
    case 'cgpa':
      return data.map(s => ({
        'Rank': s.rank,
        'Roll Number': s.rollNumber,
        'Name': s.name,
        'Department': s.department,
        'Batch': s.batch,
        'CGPA': s.cgpa
      }));
    case 'risk':
      return data.map(s => ({
        'Roll Number': s.rollNumber,
        'Name': s.name,
        'Department': s.department,
        'CGPA': s.cgpa,
        'Backlogs': s.backlogCount,
        'Risk Factors': s.riskFactors?.join('; ')
      }));
    default:
      return data;
  }
};