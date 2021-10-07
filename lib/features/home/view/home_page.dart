import 'package:flutter/material.dart';

class HomePage extends StatelessWidget {
  const HomePage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const HomePage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Home Page'),
            ElevatedButton(onPressed: () {}, child: const Text('Home Page'))
          ],
        ),
      ),
    );
  }
}
