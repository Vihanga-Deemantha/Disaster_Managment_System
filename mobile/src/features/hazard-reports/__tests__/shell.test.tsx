import { render, screen } from '@testing-library/react-native';
import { MyReportsScreen } from '../screens/MyReportsScreen';

describe('mobile shell', () => {
  it('renders the My reports tab placeholder', () => {
    render(<MyReportsScreen />);
    expect(screen.getByText('My reports')).toBeTruthy();
  });
});
