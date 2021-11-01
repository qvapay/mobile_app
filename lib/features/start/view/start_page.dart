import 'package:flutter/material.dart';
import 'package:mobile_app/features/start/view/onnboarding_view.dart';

class StartPage extends StatelessWidget {
  const StartPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const StartPage());
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(child: OnboardingView()),
    );
  }
}
