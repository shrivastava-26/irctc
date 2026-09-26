import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#138d87', dark: '#0f716c', light: '#58b6b0', contrastText: '#ffffff' },
    secondary: { main: '#5f6f85', dark: '#4a586a', light: '#8b99ab', contrastText: '#ffffff' },
    background: { default: '#edf2f4', paper: '#f7fafb' },
    success: { main: '#27876e', light: '#e9f6f1', dark: '#1e6e5a' },
    warning: { main: '#b47640', light: '#fbf1e8', dark: '#925b2d' },
    error: { main: '#b65358', light: '#faecec', dark: '#944348' },
    info: { main: '#50708a', light: '#edf3f7', dark: '#3c596e' },
    text: { primary: '#233142', secondary: '#6f7f8f', disabled: '#a3afba' },
    divider: 'rgba(84,106,123,0.14)',
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Inter, Manrope, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    h1: { fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.035em' },
    h2: { fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.025em' },
    h3: { fontSize: '1.12rem', fontWeight: 800, letterSpacing: '-0.02em' },
    h4: { fontSize: '1rem', fontWeight: 800 },
    h5: { fontSize: '0.95rem', fontWeight: 750 },
    h6: { fontSize: '0.9rem', fontWeight: 800 },
    body1: { fontSize: '0.92rem' },
    body2: { fontSize: '0.82rem' },
    caption: { fontSize: '0.73rem' },
    button: { textTransform: 'none', fontWeight: 750, fontSize: '0.82rem' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: '#edf2f4', color: '#233142' } } },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12, minHeight: 40,
          transition: 'transform 100ms ease, box-shadow 100ms ease, background-color 100ms ease, border-color 100ms ease',
          '&:active': { transform: 'translateY(1px)' },
          '&:focus-visible': { outline: '2px solid #138d87', outlineOffset: 2 },
        },
        contained: {
          boxShadow: '3px 3px 8px rgba(142,158,171,0.24), -3px -3px 8px rgba(255,255,255,0.78)',
          '&:hover': { boxShadow: '4px 4px 10px rgba(142,158,171,0.28), -4px -4px 10px rgba(255,255,255,0.82)' },
        },
        outlined: {
          borderColor: 'rgba(84,106,123,0.20)',
          '&:hover': { borderColor: 'rgba(19,141,135,0.44)', backgroundColor: 'rgba(19,141,135,0.04)' },
        },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 12, '&:focus-visible': { outline: '2px solid #138d87', outlineOffset: 2 } } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 18, boxShadow: '4px 5px 14px rgba(142,158,171,0.20), -4px -4px 14px rgba(255,255,255,0.88)' } } },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700 } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: 'rgba(84,106,123,0.10)', color: '#233142' },
        head: { color: '#6f7f8f', fontWeight: 750, background: 'rgba(255,255,255,0.42)' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: 'rgba(248,250,251,0.96)',
          border: '1px solid rgba(255,255,255,0.78)',
          borderRadius: 20,
          boxShadow: '10px 16px 36px rgba(112,128,142,0.24), -10px -10px 28px rgba(255,255,255,0.82)',
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          background: 'rgba(248,250,251,0.62)',
          border: '1px solid rgba(84,106,123,0.10)',
          boxShadow: 'inset 1px 1px 4px rgba(142,158,171,0.08), inset -1px -1px 4px rgba(255,255,255,0.72)',
          '&:before': { display: 'none' },
        },
      },
    },
  },
})
