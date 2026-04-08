import React, { createContext, useContext } from 'react';

const brandColors = {
    // Background
    background: '#02000e',
    backgroundSecondary: '#0d0920',
    backgroundTertiary: '#160e45',

    // Text
    text: '#ffffff',
    textSecondary: '#aaaaaa',
    textTertiary: '#666666',

    // Primary (Green)
    primary: '#7cce06',
    primaryDark: '#6bb805',
    primaryLight: 'rgba(124,206,6,0.15)',

    // Secondary (Blue)
    secondary: '#2b12c6',
    secondaryDark: '#1a0a7a',
    secondaryLight: 'rgba(43,18,198,0.2)',

    // UI Elements
    border: 'rgba(255,255,255,0.08)',
    card: 'rgba(255,255,255,0.07)',
    shadow: '#000000',

    // Status
    success: '#7cce06',
    error: '#ff6b6b',
    warning: '#ffb84d',
    info: '#5c4de6',

    // Special
    white: '#ffffff',
    black: '#000000',
};

interface ThemeContextType {
    isDark: boolean;
    theme: string;
    colors: typeof brandColors;
    setTheme: (theme: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
    isDark: true,
    theme: 'dark',
    colors: brandColors,
    setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    return (
        <ThemeContext.Provider value={{ isDark: true, theme: 'dark', colors: brandColors, setTheme: () => {} }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
