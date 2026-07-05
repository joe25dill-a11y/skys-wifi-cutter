import { ThemeProvider } from './contexts/ThemeContext';
import { DashboardPage } from './pages/DashboardPage';

function App() {
  return (
    <ThemeProvider>
      <DashboardPage />
    </ThemeProvider>
  );
}

export default App;
