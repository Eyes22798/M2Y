import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ChatScreen } from '@/features/chat/screens/ChatScreen';
import { SharedItemDetailScreen } from '@/features/shared-item/screens/SharedItemDetailScreen';
import { SpaceHomeScreen } from '@/features/space-home/screens/SpaceHomeScreen';
import {
  PreviewWorkspaceProvider,
  usePreviewWorkspace,
} from '@/stores/preview-workspace/PreviewWorkspaceProvider';

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
  const { state } = usePreviewWorkspace();
  return <Text>{`items:${state.sharedItems.length}`}</Text>;
}

describe('preview workspace user flows', () => {
  beforeEach(() => {
    mockRouterBack.mockClear();
    mockRouterPush.mockClear();
  });

  it('sends a message and saves a selected message to Space', async () => {
    const view = await render(
      <PreviewWorkspaceProvider>
        <ChatScreen />
        <WorkspaceCount />
      </PreviewWorkspaceProvider>,
    );

    fireEvent.changeText(view.getByTestId('chat-input'), '  明天一起吃饭  ');
    await waitFor(() =>
      expect(view.getByTestId('chat-send').props.accessibilityState).toEqual({ disabled: false }),
    );
    fireEvent.press(view.getByTestId('chat-send'));

    await waitFor(() => expect(view.getByText('明天一起吃饭')).toBeTruthy());
    expect(view.getByText('消息已发送 · 当前设备预览')).toBeTruthy();

    fireEvent.press(view.getByLabelText('对方的消息：周六去看电影吗？'));
    await waitFor(() => expect(view.getByLabelText('保存到 Space')).toBeTruthy());
    fireEvent.press(view.getByLabelText('保存到 Space'));
    await waitFor(() => expect(view.getByTestId('save-to-space-submit')).toBeTruthy());
    fireEvent.press(view.getByTestId('save-to-space-submit'));

    await waitFor(() => expect(view.getByText('items:3')).toBeTruthy());
    expect(view.getByText('已保存为笔记')).toBeTruthy();
  });

  it('filters Space and opens an existing item', async () => {
    const view = await render(
      <PreviewWorkspaceProvider>
        <SpaceHomeScreen />
      </PreviewWorkspaceProvider>,
    );

    fireEvent.press(view.getByLabelText('筛选笔记'));
    await waitFor(() => expect(view.getByText('没有筛选结果')).toBeTruthy());

    fireEvent.press(view.getByLabelText('查看全部'));
    await waitFor(() => expect(view.getByLabelText('打开出发前发送路线')).toBeTruthy());
    fireEvent.press(view.getByLabelText('打开出发前发送路线'));

    expect(mockRouterPush).toHaveBeenCalledWith('/space/item-2');
  });

  it('confirms deletion from the detail screen', async () => {
    const view = await render(
      <PreviewWorkspaceProvider>
        <SharedItemDetailScreen />
        <WorkspaceCount />
      </PreviewWorkspaceProvider>,
    );

    fireEvent.press(view.getByLabelText('删除共享条目'));
    await waitFor(() => expect(view.getByLabelText('删除条目')).toBeTruthy());
    fireEvent.press(view.getByLabelText('删除条目'));

    await waitFor(() => expect(view.getByText('items:1')).toBeTruthy());
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});
