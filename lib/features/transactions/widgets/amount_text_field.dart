import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class AmountTextField extends StatefulWidget {
  const AmountTextField({Key? key, required this.transaction})
      : super(key: key);

  final UserTransaction transaction;

  @override
  State<AmountTextField> createState() => AmountTextFieldState();
}

class AmountTextFieldState extends State<AmountTextField> {
  final _controller = TextEditingController();
  bool _haveAmount = false;

  @override
  void initState() {
    final amount = widget.transaction.amount;
    if (amount.isNotEmpty && amount != '0.0') {
      _controller.value = TextEditingValue(text: amount);
      setState(() {
        _haveAmount = true;
      });
    }
    super.initState();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final qButtomWidth = size.width * 0.42;
    return Column(
      children: [
        BlocBuilder<SendTransactionCubit, SendTransactionState>(
          builder: (context, state) {
            if (state.amountFieldIsVisible || _haveAmount) {
              return Container(
                alignment: Alignment.center,
                width: size.width * 0.55,
                child: Column(
                  children: [
                    TextField(
                      controller: _controller,
                      autofocus: true,
                      decoration: InputDecoration(
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            context
                                .read<SendTransactionCubit>()
                                .changeVisibilityOfAmount(visibility: false);
                            _controller.clear();
                            setState(() {
                              _haveAmount = false;
                            });
                          },
                        ),
                        prefixText: r'$',
                        prefixStyle:
                            const TextStyle(fontSize: 38, color: Colors.blue),
                        prefixIcon: const SizedBox.shrink(),
                        border: InputBorder.none,
                      ),
                      keyboardType: TextInputType.number,
                      style: const TextStyle(fontSize: 38, color: Colors.blue),
                      onChanged: (value) => context
                          .read<SendTransactionCubit>()
                          .changeAmount(value),
                    ),
                    if (state.amount.invalid)
                      const Text(
                        'Monto invalido',
                        style: TextStyle(fontSize: 12, color: Colors.red),
                      ),
                  ],
                ),
              );
            }
            return TextButton(
              onPressed: () =>
                  context.read<SendTransactionCubit>().changeVisibilityOfAmount(
                        visibility: true,
                      ),
              child: const Text(
                'Entre la cantidad a enviar',
                style: TextStyle(
                  fontSize: 16,
                  fontFamily: 'Roboto',
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF3186E7),
                ),
              ),
            );
          },
        ),
        SizedBox(height: size.height * 0.05),
        QButtom(
          width: qButtomWidth,
          height: kToolbarHeight,
          styleGradient: kLinearGradientBlue,
          text: 'Monto Máximo',
          onPressed: () {
            final userAmountMax =
                context.read<UserDataCubit>().state.userData?.balance ?? '0.0';
            context.read<SendTransactionCubit>().changeAmount(userAmountMax);
            _controller.value = TextEditingValue(text: userAmountMax);
            context
                .read<SendTransactionCubit>()
                .changeVisibilityOfAmount(visibility: true);
          },
        ),
      ],
    );
  }
}
