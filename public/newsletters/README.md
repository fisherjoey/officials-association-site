# Newsletter Storage

This directory contains the newsletter PDF files.

## Directory Structure
```
/newsletters
  /2024
    - january.pdf
    - february.pdf
    - march.pdf
    ...
  /2023
    - january.pdf
    - february.pdf
    ...
```

## File Naming Convention
- Use lowercase month names
- Format: `[month].pdf`
- Example: `december.pdf`

## Adding New Newsletters
1. Upload the PDF file to the appropriate year folder
2. Update the newsletter data in the CMS or `/app/portal/newsletter/page.tsx`
3. Ensure file size is optimized (ideally under 5MB)

## PDF Requirements
- Format: PDF 1.4 or higher
- Optimized for web viewing
- Include text layer for searchability
- Resolution: 150-200 DPI for optimal file size/quality balance