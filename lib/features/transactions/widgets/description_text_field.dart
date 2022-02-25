import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/themes/colors.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

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
                  onTap: () {
                    if (_haveDescription) {
                      context
                          .read<SendTransactionCubit>()
                          .changeDescription(widget.transaction.description);
                    }
                  },
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
