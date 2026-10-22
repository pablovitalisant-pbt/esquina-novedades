import { renderHook, act } from '@testing-library/react';
import { useShareImage } from '@/hooks/useShareImage';

describe('useShareImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls navigator.share with a File when Web Share API is available', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' })),
    } as any);
    const mockShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: mockShare, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(
        'https://res.cloudinary.com/test/image/upload/productos/VD-017.jpg',
        'VD-017.jpg',
        'VD-017 — SANDWICHERA'
      );
    });

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) })
    );
  });

  test('triggers download as fallback when Web Share API is unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' })),
    } as any);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });

    const createObjectURL = jest.fn().mockReturnValue('blob:test');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    // Mock only the click on a real anchor element
    const realAnchor = document.createElement('a');
    const mockClick = jest.fn();
    realAnchor.click = mockClick;
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') return realAnchor;
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(
        'https://res.cloudinary.com/test/image/upload/productos/VD-017.jpg',
        'VD-017.jpg',
        'VD-017 — SANDWICHERA'
      );
    });

    expect(createObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  test('handles fetch error gracefully', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useShareImage());
    await expect(
      act(async () => {
        await result.current.shareImage('https://example.com/img.jpg', 'img.jpg', 'Test');
      })
    ).resolves.not.toThrow();
  });

  test('passes text as 4th arg to navigator.share when provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' })),
    } as any);
    const mockShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: mockShare, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage('u.jpg', 'u.jpg', 'Titulo', '$20.00 · ≈ AR$ 19,600.00');
    });

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array), title: 'Titulo', text: '$20.00 · ≈ AR$ 19,600.00' })
    );
  });

  test('fallback download toast includes text when provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' })),
    } as any);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });

    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:test');
    global.URL.revokeObjectURL = jest.fn();

    const toast = require('sonner').toast;
    const infoSpy = jest.spyOn(toast, 'info');

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage('u.jpg', 'u.jpg', 'Titulo', '$20.00');
    });

    expect(infoSpy).toHaveBeenCalledWith('Imagen descargada — $20.00 — ábrela desde tu galería para compartir');
    infoSpy.mockRestore();
  });
});
