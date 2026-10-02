#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Contenedor que sale en NEGRO en capturas, grabaciones y AirPlay.
 * iOS no deja bloquear capturas: los hijos se montan dentro del lienzo de un
 * UITextField con secureTextEntry, que el sistema excluye de toda captura.
 */
@interface QPSecureView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
