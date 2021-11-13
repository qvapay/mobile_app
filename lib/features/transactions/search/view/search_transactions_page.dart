import 'package:flutter/material.dart';
import 'package:mobile_app/features/transactions/search/view/view.dart';

class SearchTransactionPage extends StatelessWidget {
  const SearchTransactionPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(
        builder: (_) => const SearchTransactionPage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios,
            color: Colors.blue,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        centerTitle: true,
        title: const Text(
          'Transacciones',
          style: TextStyle(
            color: Colors.blue,
            fontWeight: FontWeight.bold,
            fontSize: 22,
          ),
        ),
      ),
      body: const SearchTransactionView(),
    );
  }
}
