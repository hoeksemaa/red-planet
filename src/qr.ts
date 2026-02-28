import QRCode from 'qrcode';

requestAnimationFrame(() => {
    const canvas = document.getElementById('qr') as HTMLCanvasElement;
    const wrap = canvas.parentElement!;
    const size = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));

    QRCode.toCanvas(canvas, window.location.origin, {
        width: size,
        margin: 2,
        color: { dark: '#202124', light: '#ffffff' },
    });

    const link = document.getElementById('home-link') as HTMLAnchorElement;
    link.href = '/';
    link.textContent = window.location.host;
});
