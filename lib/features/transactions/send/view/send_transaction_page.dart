import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/home/home.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class SendTransactionPage extends StatelessWidget {
  const SendTransactionPage({Key? key, required this.transaction})
      : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go({required UserTransaction transaction}) {
    return MaterialPageRoute<void>(
        builder: (_) => SendTransactionPage(
              transaction: transaction,
            ));
  }

  final UserTransaction transaction;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Scaffold(
      backgroundColor: kbgPage,
      appBar: AppBar(
        title: const Text('Enviar Transacción',
            style: TextStyle(
              fontSize: 20,
              color: Color(0xFF3186E7),
              fontFamily: 'Roboto',
              fontWeight: FontWeight.w900,
            )),
        centerTitle: true,
        backgroundColor: kbgPage,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(
            Icons.arrow_back_ios,
            color: kActiveText,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: TextButton(
                onPressed: () {
                  Navigator.pushAndRemoveUntil<void>(
                    context,
                    HomePage.go(),
                    (route) => false,
                  );
                },
                child: const Text(
                  'Cancelar',
                  style: TextStyle(
                    fontSize: 16,
                    color: Color(0xFFBF461F),
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.w700,
                  ),
                )),
          )
        ],
      ),
      body: Stack(fit: StackFit.expand, children: [
        SingleChildScrollView(
          child: Column(
            children: [
              Center(
                child: HeaderTransactionDeatails(
                  name: transaction.name,
                  email: transaction.email ?? '',
                  imageUrl: transaction.imageUrl,
                ),
              ),
              SizedBox(height: size.height * 0.05),
              _AmountTextField(transaction: transaction),
              SizedBox(height: size.height * 0.05),
              DescriptionTextField(transaction: transaction),
              SizedBox(height: size.height * 0.25),
            ],
          ),
        ),
        Positioned.fill(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Align(
              alignment: Alignment.bottomCenter,
              child: BlocConsumer<SendTransactionCubit, SendTransactionState>(
                listener: (context, state) {
                  if (state.status.isSubmissionFailure) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(state.errorMessage ??
                          'Error en la Trandeferencia !!'),
                    ));
                  } else if (state.status.isSubmissionSuccess) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('Trandeferencia enviada !!'),
                    ));
                    Navigator.pushReplacement<void, void>(
                        context,
                        TransactionDetailPage.go(
                          isFromPayment: true,
                          title: 'Detalles',
                          userTransaction: state.userTransactionPaid!,
                        ));
                  }
                },
                builder: (context, state) {
                  return AnimatedSwitcher(
                    duration: const Duration(milliseconds: 150),
                    child: state.status.isSubmissionInProgress
                        ? const CircularProgressIndicator()
                        : QButtom(
                            width: size.width,
                            height: kToolbarHeight,
                            styleGradient: (state.status.isValid &&
                                    state.amountFieldIsVisible)
                                ? kLinearGradientLargeGreen
                                : kLinearGradientGrey,
                            text: 'Realizar Pago',
                            onPressed: () {
                              if (state.status.isValid) {
                                context
                                    .read<SendTransactionCubit>()
                                    .processTransaction(transaction);
                              }
                            },
                          ),
                  );
                },
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

class DescriptionTextField extends StatefulWidget {
  const DescriptionTextField({
    Key? key,
    required this.transaction,
  }) : super(key: key);

  final UserTransaction transaction;

  @override
  State<DescriptionTextField> createState() => _DescriptionTextFieldState();
}

class _DescriptionTextFieldState extends State<DescriptionTextField> {
  final _controller = TextEditingController();

  bool _haveDescription = false;

  @override
  void initState() {
    final description = widget.transaction.description;
    if (description.isNotEmpty) {
      _controller.value = TextEditingValue(text: description);
      setState(() {
        _haveDescription = true;
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
    return BlocBuilder<SendTransactionCubit, SendTransactionState>(
      builder: (context, state) {
        if (state.descriptionFieldIsVisible || _haveDescription) {
          return Container(
            alignment: Alignment.center,
            width: size.width * 0.8,
            child: Column(
              children: [
                TextField(
                  controller: _controller,
                  maxLines: 3,
                  minLines: 1,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  decoration: InputDecoration(
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        context
                            .read<SendTransactionCubit>()
                            .changeVisibilityOfDescription(
                              visibility: false,
                            );
                        _controller.clear();
                        setState(() {
                          _haveDescription = false;
                        });
                      },
                    ),
                  ),
                  onChanged: (value) => context
                      .read<SendTransactionCubit>()
                      .changeDescription(value),
                ),
              ],
            ),
          );
        }
        return TextButton(
          onPressed: () => context
              .read<SendTransactionCubit>()
              .changeVisibilityOfDescription(visibility: true),
          child: const Text(
            '+ Agregar comentario',
            style: TextStyle(
              fontSize: 16,
              fontFamily: 'Roboto',
              fontWeight: FontWeight.bold,
              color: Color(0xFF3186E7),
            ),
          ),
        );
      },
    );
  }
}

class _AmountTextField extends StatefulWidget {
  const _AmountTextField({Key? key, required this.transaction})
      : super(key: key);

  final UserTransaction transaction;

  @override
  State<_AmountTextField> createState() => _AmountTextFieldState();
}

class _AmountTextFieldState extends State<_AmountTextField> {
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
