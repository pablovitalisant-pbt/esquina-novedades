/**
 * Fase B — fotos-1: entrega rapida (urlCloudinary) y public_id saneado.
 */
import { urlCloudinary, sanearCodigo } from '@/lib/cloudinary-url';

describe('urlCloudinary', () => {
  it('inserta f_auto,q_auto,c_limit,w_N tras /image/upload/', () => {
    const original = 'https://res.cloudinary.com/demo/image/upload/v123/productos/A.jpg';
    expect(urlCloudinary(original, 400)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400/v123/productos/A.jpg'
    );
  });

  it('no duplica la transformacion si ya existe', () => {
    const conTransformacion =
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_800/v123/productos/A.jpg';
    expect(urlCloudinary(conTransformacion, 400)).toBe(conTransformacion);
  });

  it('deja intacta una url que no es de Cloudinary', () => {
    const externa = 'https://cdn.ejemplo.cl/fotos/A.jpg';
    expect(urlCloudinary(externa, 400)).toBe(externa);
  });

  it('usa 600 por defecto', () => {
    expect(
      urlCloudinary('https://res.cloudinary.com/demo/image/upload/productos/A.jpg')
    ).toContain('w_600');
  });

  it('devuelve cadena vacia si no hay url', () => {
    expect(urlCloudinary(null)).toBe('');
  });
});

describe('sanearCodigo', () => {
  it('conserva [A-Za-z0-9_-] y reemplaza el resto por _', () => {
    expect(sanearCodigo('AB C/D.1')).toBe('AB_C_D_1');
    expect(sanearCodigo('Caja-12_A')).toBe('Caja-12_A');
  });
});
