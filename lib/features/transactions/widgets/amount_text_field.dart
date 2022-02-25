import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/themes/colors.dart';
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

  @override
  void initState() {
    final amount = widget.transaction.amount;
    if (amount.isNotEmpty && amount != '0.0') {
      context.read<SendTransactionCubit>().changeAmount(amount);
      _controller.value = TextEditingValue(text: amount);
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
            if (state.amountFieldIsVisible) {
              return Container(
                alignment: Alignment.center,
                width: size.width * 0.55,
                child: Column(
                  children: [
                    TextField(
                      controller: _controller,
                      autofocus: true,
                      decoration: InputDecoration(
                        enabledBorder: const UnderlineInputBorder(
                          borderSide: BorderSide(color: AppColors.greyInfo),
                        ),
                        suffixIcon: IconButton(
                          icon: Icon(
                            Icons.close,
                            color: Theme.of(context).textTheme.headline1!.color,
                          ),
                          onPressed: () {
                            context
                                .read<SendTransactionCubit>()
                                .changeVisibilityOfAmount(visibility: false);
                            _controller.clear();
                          },
                        ),
                        prefixText: r'$',
                        prefixStyle: TextStyle(
                          fontSize: 38,
                          color: Theme.of(context).primaryColor,
                        ),
                        prefixIcon: const SizedBox.shrink(),
                        border: InputBorder.none,
                      ),
                      keyboardType: TextInputType.number,
                      style: TextStyle(
                          fontSize: 38, color: Theme.of(context).primaryColor),
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
              child: Text(
                'Entre la cantidad a enviar',
                style: TextStyle(
                  fontSize: 16,
                  fontFamily: 'Roboto',
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).primaryColor,
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
