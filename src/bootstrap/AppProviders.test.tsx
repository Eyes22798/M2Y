import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppProviders } from './AppProviders';

describe('AppProviders', () => {
  it('mounts application content inside the native root providers', async () => {
    const view = await render(
      <AppProviders>
        <Text>provider content</Text>
      </AppProviders>,
    );

    expect(view.getByText('provider content')).toBeTruthy();
  });
});
