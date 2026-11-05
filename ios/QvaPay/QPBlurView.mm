#import "QPBlurView.h"

#import <react/renderer/components/QvaPaySpecs/ComponentDescriptors.h>
#import <react/renderer/components/QvaPaySpecs/Props.h>
#import <react/renderer/components/QvaPaySpecs/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface QPBlurView () <RCTQPBlurViewViewProtocol>
@end

@implementation QPBlurView {
  UIVisualEffectView *_effectView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<QPBlurViewComponentDescriptor>();
}

/**
 * Material FINO y de modo fijo: el tema de la app no sigue al del sistema, así
 * que un material adaptativo saldría claro con la app en oscuro.
 */
static UIBlurEffect *QPBlurEffectFor(QPBlurViewBlurStyle style)
{
  return [UIBlurEffect effectWithStyle:(style == QPBlurViewBlurStyle::Light
                                          ? UIBlurEffectStyleSystemThinMaterialLight
                                          : UIBlurEffectStyleSystemThinMaterialDark)];
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const QPBlurViewProps>();
    _props = defaultProps;

    _effectView = [[UIVisualEffectView alloc] initWithEffect:QPBlurEffectFor(defaultProps->blurStyle)];
    _effectView.frame = self.bounds;
    _effectView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    // Es un fondo: los toques son de lo que React pinta encima
    _effectView.userInteractionEnabled = NO;
    [self addSubview:_effectView];
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<const QPBlurViewProps>(_props);
  const auto &newViewProps = *std::static_pointer_cast<const QPBlurViewProps>(props);

  if (oldViewProps.blurStyle != newViewProps.blurStyle) {
    _effectView.effect = QPBlurEffectFor(newViewProps.blurStyle);
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _effectView.frame = self.bounds;
}

@end
