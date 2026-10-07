import { render, screen } from '@testing-library/react-native';
import { MyReportsScreen } from '../screens/MyReportsScreen';
import { ReportHazardScreen } from '../screens/ReportHazardScreen';

describe('mobile shell', () => {
  it('renders the Report tab placeholder', () => {
    render(<ReportHazardScreen />);
    expect(screen.getByText('Report a hazard')).toBeTruthy();
  });

  it('renders the My reports tab placeholder', () => {
    render(<MyReportsScreen />);
    expect(screen.getByText('My reports')).toBeTruthy();
  });
});
