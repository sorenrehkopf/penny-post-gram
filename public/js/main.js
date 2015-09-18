$(function(){

  $('#change-photos').on('click',function(e){
    e.preventDefault();
    $.getJSON('/').done(function(data){
      $('#image-input1').val(data.image1);
      $('.image1').attr('src',data.image1);
      $('#image-input2').val(data.image2);
      $('.image2').attr('src',data.image2);
      $('#image-input3').val(data.image3);
      $('.image3').attr('src',data.image3);
    });
  });

});