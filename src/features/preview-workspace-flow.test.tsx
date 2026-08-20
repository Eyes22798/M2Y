import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { demoWorkspaceSnapshot } from '@/application/workspace/demo-workspace';
import { spacing } from '@/design/tokens';
import { ChatScreen } from '@/features/chat/screens/ChatScreen';
import { SharedItemDetailScreen } from '@/features/shared-item/screens/SharedItemDetailScreen';
import { SpaceHomeScreen } from '@/features/space-home/screens/SpaceHomeScreen';
import { useWorkspace, WorkspaceProvider } from '@/stores/workspace/WorkspaceProvider';
import { InMemoryWorkspaceSession } from '@/testing/workspace/InMemoryWorkspaceSession';

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouterBack(),
    navigate: jest.fn(),
    push: (href: unknown) => mockRouterPush(href),
  },
  useLocalSearchParams: () => ({ itemId: 'item-2' }),
}));

function WorkspaceCount() {
  const { state } = useWorkspace();
  return <Text>{`items:${state.sharedItems.length}`}</Text>;
}

describe('preview workspace user flows', () => {
  beforeEach(() => {
    mockRouterBack.mockClear();
    mockRouterPush.mockClear();
  });

  it('sends a message and saves a selected message to Space', async () => {
    const session = new InMemoryWorkspaceSession(demoWorkspaceSnapshot);
    const view = await render(
      <WorkspaceProvider session={session}>
        <ChatScreen />
        <WorkspaceCount />
      </WorkspaceProvider>,
    );

    expect(view.getByTestId('chat-keyboard-avoiding-view').props).toMatchObject({
      automaticOffset: true,
      behavior: 'padding',
    });

    fireEvent.changeText(view.getByTestId('chat-input'), '  明天一起吃饭  ');
    await waitFor(() =>
      expect(view.getByTestId('chat-send').props.accessibilityState).toEqual({ disabled: false }),
    );
    await act(async () => {
      fireEvent.press(view.getByTestId('chat-send'));
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByText('明天一起吃饭')).toBeTruthy());
    expect(view.getByText('消息已保存到当前设备')).toBeTruthy();

    fireEvent.press(view.getByLabelText('对方的消息：周六去看电影吗？'));
    await waitFor(() => expect(view.getByLabelText('保存到 Space')).toBeTruthy());
    expect(view.getByTestId('bottom-sheet-keyboard-avoiding-view').props).toMatchObject({
      automaticOffset: true,
      behavior: 'padding',
    });
    fireEvent.press(view.getByLabelText('保存到 Space'));
    await waitFor(() => expect(view.getByTestId('save-to-space-submit')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId('save-to-space-submit'));
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByText('items:3')).toBeTruthy());
    expect(view.getByText('已保存为笔记')).toBeTruthy();
  });

  it('filters Space and opens an existing item', async () => {
    const session = new InMemoryWorkspaceSession(demoWorkspaceSnapshot);
    const view = await render(
      <WorkspaceProvider session={session}>
        <SpaceHomeScreen />
      </WorkspaceProvider>,
    );

    fireEvent.press(view.getByLabelText('筛选笔记'));
    await waitFor(() => expect(view.getByText('没有筛选结果')).toBeTruthy());

    fireEvent.press(view.getByLabelText('查看全部'));
    await waitFor(() => expect(view.getByLabelText('打开出发前发送路线')).toBeTruthy());
    fireEvent.press(view.getByLabelText('打开出发前发送路线'));

    expect(mockRouterPush).toHaveBeenCalledWith('/space/item-2');
  });

  it('confirms deletion from the detail screen', async () => {
    const session = new InMemoryWorkspaceSession(demoWorkspaceSnapshot);
    const view = await render(
      <WorkspaceProvider session={session}>
        <SharedItemDetailScreen />
        <WorkspaceCount />
      </WorkspaceProvider>,
    );

    expect(view.getByTestId('shared-item-keyboard-scroll').props).toMatchObject({
      bottomOffset: spacing.xl,
      keyboardDismissMode: 'interactive',
    });

    fireEvent.press(view.getByLabelText('删除共享条目'));
    await waitFor(() => expect(view.getByLabelText('删除条目')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByLabelText('删除条目'));
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByText('items:1')).toBeTruthy());
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});
